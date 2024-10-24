const { ipcRenderer } = require('electron');
const io = require('socket.io-client');

let currentImages = [];
let currentFolder = '';
let socket;

async function selectFolder() {
    try {
        const folderPath = await ipcRenderer.invoke('select-folder');
        if (folderPath) {
            await loadImages(folderPath);
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
        showError('Failed to select folder');
    }
}

async function loadImages(folderPath) {
    try {
        currentFolder = folderPath;
        const groupedImages = await ipcRenderer.invoke('get-images', folderPath);
        currentImages = groupedImages;
        displayImages();
    } catch (error) {
        console.error('Error loading images:', error);
        showError('Failed to load images');
    }
}

function displayImages() {
    const imageGrid = document.getElementById('imageGrid');
    imageGrid.innerHTML = '';

    if (currentImages.length === 0) {
        document.getElementById('instructions').textContent = 'No images found in the selected folder.';
    } else {
        document.getElementById('instructions').textContent = `Displaying images grouped by month`;

        currentImages.forEach(([month, images]) => {
            const monthHeader = document.createElement('h2');
            monthHeader.textContent = month;
            monthHeader.className = 'month-header';
            imageGrid.appendChild(monthHeader);

            const monthGrid = document.createElement('div');
            monthGrid.className = 'month-grid';

            images.forEach(image => {
                const img = document.createElement('img');
                img.src = image.path;
                img.className = 'imageItem';
                img.addEventListener('click', () => openPreviewModal(image));
                monthGrid.appendChild(img);
            });

            imageGrid.appendChild(monthGrid);
        });
    }
}

function openPreviewModal(image) {
    const searchModal = document.getElementById('searchModal');
    const modal = document.getElementById('previewModal');
    const previewImage = document.getElementById('previewImage');
    const previewCaption = document.getElementById('previewCaption');
    const openInDefaultApp = document.getElementById('openInDefaultApp');
    const editImage = document.getElementById('editImage');
    const copyText = document.getElementById('copyText');

    // If opened from search results, keep search modal visible but behind
    if (searchModal.style.display === 'block') {
        searchModal.style.zIndex = '1000';
        modal.style.zIndex = '1001';
    }

    previewImage.src = image.path;
    previewCaption.textContent = image.caption || 'No caption available';
    modal.style.display = 'block';

    openInDefaultApp.onclick = async () => {
        try {
            await ipcRenderer.invoke('open-in-default-app', image.path);
        } catch (error) {
            console.error('Error opening image in default app:', error);
            showError('Failed to open image in default app');
        }
    };

    editImage.onclick = async () => {
        try {
            await ipcRenderer.invoke('edit-image', image.path);
        } catch (error) {
            console.error('Error editing image:', error);
            showError('Failed to edit image');
        }
    };

    copyText.onclick = () => {
        if (image.text) {
            navigator.clipboard.writeText(image.text).then(() => {
                showSuccess('Text copied to clipboard');
            }, () => {
                showError('Failed to copy text');
            });
        } else {
            showError('No text available for this image');
        }
    };
}


function openSearchModal() {
    document.getElementById('searchModal').style.display = 'block';
}

async function searchImages() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const query = searchInput.value.trim();

    if (!currentFolder) {
        showError('Please select a folder first.');
        return;
    }

    if (!query) {
        showError('Please enter a search query.');
        return;
    }

    try {
        const groupedResults = await ipcRenderer.invoke('search-images', currentFolder, query);
        displaySearchResults(groupedResults);
        openSearchModal();
    } catch (error) {
        console.error('Error searching images:', error);
        showError('Error searching images. Check the console for details.');
    }
}

function displaySearchResults(groupedResults) {
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = '';

    if (groupedResults.length === 0) {
        searchResults.innerHTML = '<p>No matching images found.</p>';
    } else {
        groupedResults.forEach(([month, results]) => {
            const monthHeader = document.createElement('h3');
            monthHeader.textContent = month;
            monthHeader.className = 'month-header';
            searchResults.appendChild(monthHeader);

            const monthGrid = document.createElement('div');
            monthGrid.className = 'month-grid';

            results.forEach(result => {
                const resultItem = document.createElement('div');
                resultItem.className = 'searchResultItem';

                const img = document.createElement('img');
                img.src = result.path;
                img.className = 'searchResultImage';
                img.addEventListener('click', () => openPreviewModal(result));

                const caption = document.createElement('p');
                caption.className = 'imageCaption';
                caption.textContent = result.caption || 'No caption available';

                resultItem.appendChild(img);
                resultItem.appendChild(caption);
                monthGrid.appendChild(resultItem);
            });

            searchResults.appendChild(monthGrid);
        });
    }
}

function openImageOverlay(image) {
    const overlay = document.getElementById('imageOverlay');
    const overlayImage = document.getElementById('overlayImage');
    const overlayCaption = document.getElementById('overlayCaption');

    overlayImage.src = image.path;
    overlayCaption.textContent = image.caption || 'No caption available';
    overlay.style.display = 'block';

    overlay.onclick = () => {
        overlay.style.display = 'none';
    };
}

function showError(message) {
    alert(message);
}

function showSuccess(message) {
    alert(message);
}

// Event Listeners
document.getElementById('selectFolderButton').addEventListener('click', selectFolder);
document.getElementById('processButton').addEventListener('click', processImages);
document.getElementById('searchButton').addEventListener('click', searchImages);

document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
        closeBtn.closest('.modal').style.display = 'none';
    });
});

window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
});

// IPC Listeners
ipcRenderer.on('folder-selected', (event, folderPath) => {
    loadImages(folderPath);
});

ipcRenderer.on('process-images', processImages);

ipcRenderer.on('open-search', openSearchModal);

function connectWebSocket() {
    socket = io('http://localhost:5000', {
      withCredentials: true
    });
  
    socket.on('connect', () => {
      console.log('WebSocket connected');
    });
  
    socket.on('image_processing_progress', (data) => {
      console.log('Processing progress:', data.progress);
      updateProgressBar(data.progress);
    });
  
    socket.on('processing_complete', (data) => {
      console.log('Processing complete:', data.message);
      updateProgressBar(100);
      showSuccessMessage(data.message);
      loadImages(currentFolder); // Reload images after processing
    });
  
    socket.on('processing_error', (data) => {
      console.error('Processing error:', data.error);
      showErrorMessage(data.error);
    });
  
    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });
  
    socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
    });
  }
  
  function updateProgressBar(progress) {
    const progressBar = document.getElementById('progressBar');
    const progressContainer = document.getElementById('progressContainer');
    const progressText = document.getElementById('progressText');
    
    if (progressBar && progressText) {
        progressContainer.style.display = 'block';
        progressBar.value = progress;
        progressBar.style.width = '100%'; // Ensure full width
        progressText.textContent = `Processing: ${progress.toFixed(1)}%`;
    }
}
// Make sure to call connectWebSocket when the page loads
document.addEventListener('DOMContentLoaded', connectWebSocket);
  
  function showSuccessMessage(message) {
    // Implement this function to show a success message in your UI
    console.log('Success:', message);
    alert(message); // Replace this with a more user-friendly UI notification
  }
  
  function showErrorMessage(error) {
    // Implement this function to show an error message in your UI
    console.error('Error:', error);
    alert('Error: ' + error); // Replace this with a more user-friendly UI notification
  }
  
  async function processImages() {
    if (!currentFolder) {
      showErrorMessage('Please select a folder first.');
      return;
    }
    try {
        const response = await fetch('http://localhost:5000/process_images', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ folderPath: currentFolder }),
        });
    
        if (!response.ok) {
          throw new Error('Failed to start image processing');
        }
    
        const result = await response.json();
        console.log('Processing started:', result.message);
        // The actual progress and completion will be handled by WebSocket events
      } catch (error) {
        console.error('Error starting image processing:', error);
        showErrorMessage(error.message);
      }
  }
  
  document.getElementById('processButton').addEventListener('click', processImages);

  