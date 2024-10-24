import os
import sys
import json
from PIL import Image
from transformers import BlipProcessor, BlipForConditionalGeneration
import pytesseract
import asyncio
from tqdm import tqdm

# Set up pytesseract
pytesseract.pytesseract.tesseract_cmd = r'D:\Pytesseract\tesseract.exe'  # Update this path if necessary

# Load pre-trained model
print("Loading BLIP model... This may take a moment.")
blip_processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
blip_model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")
print("Model loaded successfully!")

async def generate_caption(image_path):
    img = Image.open(image_path)
    inputs = blip_processor(images=img, return_tensors="pt")
    outputs = blip_model.generate(**inputs, max_length=100, num_beams=7, repetition_penalty=1.2)
    caption = blip_processor.decode(outputs[0], skip_special_tokens=True)
    return caption

async def extract_text(image_path):
    img = Image.open(image_path)
    text = pytesseract.image_to_string(img)
    return text.strip()

async def process_folder(folder_path, progress_callback):
    json_path = os.path.join(folder_path, 'image_descriptions.json')
    if os.path.exists(json_path):
        with open(json_path, 'r') as f:
            descriptions = json.load(f)
    else:
        descriptions = {}

    image_extensions = {'.jpg', '.jpeg', '.png', '.gif'}
    image_files = [f for f in os.listdir(folder_path) if os.path.splitext(f.lower())[1] in image_extensions]
    new_images = [img for img in image_files if img not in descriptions]

    total_images = len(new_images)
    for i, image_file in enumerate(new_images):
        image_path = os.path.join(folder_path, image_file)
        try:
            caption = await generate_caption(image_path)
            text = await extract_text(image_path)
            descriptions[image_file] = {"caption": caption, "text": text}
        except Exception as e:
            print(f"Error processing {image_file}: {str(e)}")
        
        progress = (i + 1) / total_images * 100
        await progress_callback(progress)

    with open(json_path, 'w') as f:
        json.dump(descriptions, f, indent=2)

    return f"Processed {len(new_images)} new images. Total images: {len(descriptions)}"

async def search_images(folder_path, query):
    json_path = os.path.join(folder_path, 'image_descriptions.json')
    if not os.path.exists(json_path):
        return []

    with open(json_path, 'r') as f:
        descriptions = json.load(f)

    matching_images = [
        {
            "path": os.path.join(folder_path, img),
            "name": img,
            "caption": desc["caption"],
            "text": desc["text"]
        }
        for img, desc in descriptions.items()
        if query.lower() in desc["caption"].lower() or query.lower() in desc["text"].lower()
    ]

    return matching_images

async def get_images(folder_path):
    json_path = os.path.join(folder_path, 'image_descriptions.json')
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif'}
    
    # Get all image files in the folder
    image_files = [f for f in os.listdir(folder_path) if os.path.splitext(f.lower())[1] in image_extensions]
    
    if os.path.exists(json_path):
        with open(json_path, 'r') as f:
            descriptions = json.load(f)
        
        images = [
            {
                "path": os.path.join(folder_path, img),
                "name": img,
                "caption": descriptions.get(img, {}).get("caption", ""),
                "text": descriptions.get(img, {}).get("text", "")
            }
            for img in image_files
        ]
    else:
        # If JSON file doesn't exist, return basic image information
        images = [
            {
                "path": os.path.join(folder_path, img),
                "name": img,
                "caption": "",
                "text": ""
            }
            for img in image_files
        ]
    
    return images

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python image_processor.py <folder_path> [search_query]")
        sys.exit(1)

    folder_path = sys.argv[1]

    async def main():
        if len(sys.argv) == 2:
            # Process images
            async def progress_callback(progress):
                print(f"Processing progress: {progress:.2f}%")

            result = await process_folder(folder_path, progress_callback)
            print(result)
        elif len(sys.argv) == 3:
            # Search images
            query = sys.argv[2]
            results = await search_images(folder_path, query)
            print(json.dumps(results, indent=2))
        else:
            print("Invalid number of arguments.")
            print("Usage: python image_processor.py <folder_path> [search_query]")
            sys.exit(1)

    asyncio.run(main())