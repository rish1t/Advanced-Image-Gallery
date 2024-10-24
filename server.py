from flask import Flask, request, jsonify
from flask_cors import CORS
import image_processor
import os
import logging
from datetime import datetime
from collections import defaultdict
from flask_socketio import SocketIO, emit
import asyncio

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["http://localhost:3000", "electron://localhost"]}})
socketio = SocketIO(app, cors_allowed_origins=["http://localhost:3000", "electron://localhost"], async_mode='threading')

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def group_images_by_month(images):
    grouped_images = defaultdict(list)
    for image in images:
        # Assuming the image object has a 'date' attribute
        date = datetime.fromtimestamp(os.path.getmtime(image['path']))
        month_year = date.strftime('%B %Y')
        grouped_images[month_year].append(image)
    
    # Sort the groups by date (newest first)
    sorted_groups = sorted(grouped_images.items(), key=lambda x: datetime.strptime(x[0], '%B %Y'), reverse=True)
    return sorted_groups

@app.route('/process_images', methods=['POST'])
def process_images():
    try:
        data = request.get_json()
        folder_path = data.get('folderPath')
        
        if not folder_path or not os.path.isdir(folder_path):
            return jsonify({"error": "Invalid folder path"}), 400

        async def progress_callback(progress):
            logger.info(f"Processing progress: {progress}")
            socketio.emit('image_processing_progress', {'progress': progress})

        # Run the process_folder function in a separate thread
        def run_processing():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                result = loop.run_until_complete(image_processor.process_folder(folder_path, progress_callback))
                logger.info(f"Processed images in {folder_path}: {result}")
                socketio.emit('processing_complete', {'message': result})
            except Exception as e:
                logger.error(f"Error in run_processing: {str(e)}")
                socketio.emit('processing_error', {'error': str(e)})
            finally:
                loop.close()

        socketio.start_background_task(run_processing)
        return jsonify({"message": "Image processing started"}), 202
    except Exception as e:
        logger.error(f"Error processing images: {str(e)}")
        return jsonify({"error": "An error occurred while processing images"}), 500
        
@app.route('/search_images', methods=['POST'])
def search_images():
    try:
        data = request.get_json()
        folder_path = data.get('folderPath')
        query = data.get('query')

        if not folder_path or not os.path.isdir(folder_path):
            return jsonify({"error": "Invalid folder path"}), 400
        if not query:
            return jsonify({"error": "Query is required"}), 400

        results = asyncio.run(image_processor.search_images(folder_path, query))
        grouped_results = group_images_by_month(results)
        logger.info(f"Searched images in {folder_path} with query '{query}'")
        return jsonify(grouped_results), 200
    except Exception as e:
        logger.error(f"Error searching images: {str(e)}")
        return jsonify({"error": "An error occurred while searching images"}), 500

@app.route('/get_images', methods=['POST'])
def get_images():
    try:
        data = request.get_json()
        folder_path = data.get('folderPath')

        if not folder_path or not os.path.isdir(folder_path):
            return jsonify({"error": "Invalid folder path"}), 400

        images = asyncio.run(image_processor.get_images(folder_path))
        
        if not images:
            return jsonify({"error": "No images found in the selected folder"}), 404
        
        grouped_images = group_images_by_month(images)
        logger.info(f"Retrieved {len(images)} images from {folder_path}")
        return jsonify(grouped_images), 200
    except Exception as e:
        logger.error(f"Error retrieving images: {str(e)}")
        return jsonify({"error": "An error occurred while retrieving images"}), 500

if __name__ == '__main__':
    socketio.run(app, port=5000, debug=True)