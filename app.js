// Canvas Paint Application by Aryan

// Core variables
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const lineWidthInput = document.getElementById('lineWidth');
const transparencyInput = document.getElementById('transparency');
const toolButtons = document.querySelectorAll('.tool');
const colorButtons = document.querySelectorAll('.color');
const clearButton = document.getElementById('clearCanvas');
const saveButton = document.getElementById('saveBtn');
const undoButton = document.getElementById('undoBtn');
const redoButton = document.getElementById('redoBtn');
const addLayerButton = document.getElementById('addLayer');
const deleteLayerButton = document.getElementById('deleteLayer');
const mergeLayerButton = document.getElementById('mergeLayer');
const layersList = document.getElementById('layersList');
const shapeControls = document.querySelector('.shape-controls');
const shapeWidthInput = document.getElementById('shapeWidth');
const shapeHeightInput = document.getElementById('shapeHeight');
const shapeRotationInput = document.getElementById('shapeRotation');
const rotationValue = document.getElementById('rotationValue');
const deleteShapeBtn = document.getElementById('deleteShape');

// Set initial state
let isDrawing = false;
let selectedTool = 'brush';
let currentColor = '#000000';
let currentLineWidth = 5;
let currentOpacity = 1;
let activeLayerIndex = 0;
let textInput = null;
let lastX = 0;
let lastY = 0;
let canvasHistory = [];
let historyIndex = -1;
let layers = [];
let shapes = [];
let selectedShape = null;
let isDragging = false;
let isResizing = false;
let isRotating = false;
let activeHandle = null;
let startAngle = 0;
let selectionBox = null;
let selectionHandles = [];
let rotationHandle = null;

// Shape drawing state
let startX = 0;
let startY = 0;
let tempCanvas = document.createElement('canvas');
let tempCtx = tempCanvas.getContext('2d');

// Initialize the canvas
function initCanvas() {
    // Set canvas to window size with some padding
    canvas.width = window.innerWidth - 420; // Accounting for toolbars
    canvas.height = window.innerHeight - 40;
    
    // Also set the temp canvas to same size
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    
    // Create selection UI elements
    createSelectionElements();
    
    // Create initial layer
    createLayer('Background');
    
    // Save initial state
    saveState();
}

// Create selection UI elements
function createSelectionElements() {
    // Create selection box
    selectionBox = document.createElement('div');
    selectionBox.className = 'selection-box';
    selectionBox.style.display = 'none';
    document.querySelector('.canvas-container').appendChild(selectionBox);
    
    // Create selection handles (8 handles - corners and middle of edges)
    const handlePositions = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l']; // top-left, top, top-right, etc.
    selectionHandles = []; // Clear the array before adding new handles
    
    handlePositions.forEach(pos => {
        const handle = document.createElement('div');
        handle.className = 'selection-handle';
        handle.dataset.position = pos;
        handle.style.display = 'none';
        document.querySelector('.canvas-container').appendChild(handle);
        selectionHandles.push(handle);
    });
    
    // Create rotation handle
    rotationHandle = document.createElement('div');
    rotationHandle.className = 'rotation-handle';
    rotationHandle.style.display = 'none';
    document.querySelector('.canvas-container').appendChild(rotationHandle);
}

// Layer Management
function createLayer(name) {
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = canvas.width;
    layerCanvas.height = canvas.height;
    
    const layer = {
        name: name || `Layer ${layers.length + 1}`,
        canvas: layerCanvas,
        context: layerCanvas.getContext('2d'),
        visible: true,
        shapes: [] // Store shapes specific to this layer
    };
    
    // If it's the first layer (background), fill with white
    if (layers.length === 0) {
        layer.context.fillStyle = '#ffffff';
        layer.context.fillRect(0, 0, layerCanvas.width, layerCanvas.height);
    }
    
    layers.push(layer);
    activeLayerIndex = layers.length - 1;
    updateLayersPanel();
    return layer;
}

// Update the layers panel
function updateLayersPanel() {
    layersList.innerHTML = '';
    
    layers.forEach((layer, index) => {
        const layerElement = document.createElement('div');
        layerElement.className = `layer ${index === activeLayerIndex ? 'active' : ''}`;
        layerElement.dataset.index = index;
        
        const visibilityIcon = document.createElement('span');
        visibilityIcon.className = 'layer-visibility';
        visibilityIcon.innerHTML = layer.visible ? 
            '<i class="fas fa-eye"></i>' : 
            '<i class="fas fa-eye-slash"></i>';
        
        const layerName = document.createElement('span');
        layerName.className = 'layer-name';
        layerName.textContent = layer.name;
        
        layerElement.appendChild(visibilityIcon);
        layerElement.appendChild(layerName);
        
        // Handle visibility toggle
        visibilityIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            layer.visible = !layer.visible;
            updateLayersPanel();
            renderCanvas();
        });
        
        // Handle layer selection
        layerElement.addEventListener('click', () => {
            activeLayerIndex = index;
            updateLayersPanel();
        });
        
        layersList.appendChild(layerElement);
    });
}

// Compose all layers onto main canvas
function renderCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw all visible layers from bottom to top
    layers.forEach(layer => {
        if (layer.visible) {
            ctx.drawImage(layer.canvas, 0, 0);
            
            // Render any shape being drawn currently on top
            if (layer === layers[activeLayerIndex] && isDrawing && ['rectangle', 'circle', 'line'].includes(selectedTool)) {
                ctx.drawImage(tempCanvas, 0, 0);
            }
        }
    });
    
    // Draw selection if a shape is selected
    if (selectedShape) {
        updateSelectionUI();
    }
}

// Shape Class to manage shapes
class Shape {
    constructor(type, props) {
        this.type = type; // 'rectangle', 'circle', 'line'
        this.x = props.x || 0;
        this.y = props.y || 0;
        this.width = props.width || 0;
        this.height = props.height || 0;
        this.radius = props.radius || 0;
        this.endX = props.endX || 0;
        this.endY = props.endY || 0;
        this.color = props.color || '#000000';
        this.lineWidth = props.lineWidth || 1;
        this.opacity = props.opacity || 1;
        this.rotation = props.rotation || 0; // Rotation in degrees
        this.layerIndex = props.layerIndex || 0;
    }

    // Check if a point is inside this shape
    containsPoint(x, y) {
        // Apply reverse rotation to check if point is inside
        const centerX = this.type === 'line' ? (this.x + this.endX) / 2 : this.x + this.width / 2;
        const centerY = this.type === 'line' ? (this.y + this.endY) / 2 : this.y + this.height / 2;
        
        // Translate point to origin for rotation
        const translatedX = x - centerX;
        const translatedY = y - centerY;
        
        // Apply reverse rotation
        const rad = -this.rotation * Math.PI / 180;
        const rotatedX = translatedX * Math.cos(rad) - translatedY * Math.sin(rad);
        const rotatedY = translatedX * Math.sin(rad) + translatedY * Math.cos(rad);
        
        // Translate back
        const finalX = rotatedX + centerX;
        const finalY = rotatedY + centerY;
        
        switch(this.type) {
            case 'rectangle':
                return finalX >= this.x && finalX <= this.x + this.width &&
                       finalY >= this.y && finalY <= this.y + this.height;
                
            case 'circle':
                const dx = finalX - (this.x + this.width / 2);
                const dy = finalY - (this.y + this.height / 2);
                return Math.sqrt(dx * dx + dy * dy) <= this.radius;
                
            case 'line':
                // Check if point is close to the line
                const lineDistance = this.distanceToLine(finalX, finalY);
                return lineDistance < 5; // 5px tolerance
        }
        return false;
    }
    
    // Calculate distance from point to line
    distanceToLine(x, y) {
        // Line equation parameters
        const A = this.endY - this.y;
        const B = this.x - this.endX;
        const C = (this.endX * this.y) - (this.x * this.endY);
        
        // Distance formula
        const distance = Math.abs(A * x + B * y + C) / Math.sqrt(A * A + B * B);
        
        // Check if point is within line segment bounds
        const dotProduct = (x - this.x) * (this.endX - this.x) + (y - this.y) * (this.endY - this.y);
        const squaredLength = Math.pow(this.endX - this.x, 2) + Math.pow(this.endY - this.y, 2);
        
        if (dotProduct < 0 || dotProduct > squaredLength) {
            // Point is beyond the line segment, calculate distance to nearest endpoint
            const distToStart = Math.sqrt(Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2));
            const distToEnd = Math.sqrt(Math.pow(x - this.endX, 2) + Math.pow(y - this.endY, 2));
            return Math.min(distToStart, distToEnd);
        }
        
        return distance;
    }
    
    // Draw the shape to a context
    draw(context) {
        context.save();
        
        // Set style
        context.strokeStyle = hexToRgba(this.color, this.opacity);
        context.lineWidth = this.lineWidth;
        
        // Calculate center point for rotation
        let centerX, centerY;
        if (this.type === 'line') {
            centerX = (this.x + this.endX) / 2;
            centerY = (this.y + this.endY) / 2;
        } else {
            centerX = this.x + this.width / 2;
            centerY = this.y + this.height / 2;
        }
        
        // Apply rotation from center
        context.translate(centerX, centerY);
        context.rotate(this.rotation * Math.PI / 180);
        context.translate(-centerX, -centerY);
        
        // Draw based on type
        switch(this.type) {
            case 'rectangle':
                context.beginPath();
                context.rect(this.x, this.y, this.width, this.height);
                context.stroke();
                break;
                
            case 'circle':
                context.beginPath();
                context.arc(
                    this.x + this.width / 2, 
                    this.y + this.height / 2, 
                    this.radius, 0, Math.PI * 2
                );
                context.stroke();
                break;
                
            case 'line':
                context.beginPath();
                context.moveTo(this.x, this.y);
                context.lineTo(this.endX, this.endY);
                context.stroke();
                break;
        }
        
        context.restore();
    }
    
    // Get bounds for selection box
    getBounds() {
        const bounds = { 
            x: this.x, 
            y: this.y, 
            width: this.width, 
            height: this.height 
        };
        
        // For lines, calculate bounding box
        if (this.type === 'line') {
            const minX = Math.min(this.x, this.endX);
            const minY = Math.min(this.y, this.endY);
            const maxX = Math.max(this.x, this.endX);
            const maxY = Math.max(this.y, this.endY);
            
            bounds.x = minX;
            bounds.y = minY;
            bounds.width = maxX - minX;
            bounds.height = maxY - minY;
        }
        
        return bounds;
    }
    
    // Update shape dimensions
    resize(newWidth, newHeight) {
        if (this.type === 'line') {
            // Maintain line angle but adjust length
            const angle = Math.atan2(this.endY - this.y, this.endX - this.x);
            const length = Math.sqrt(newWidth * newWidth + newHeight * newHeight);
            this.endX = this.x + Math.cos(angle) * length;
            this.endY = this.y + Math.sin(angle) * length;
        } else {
            this.width = newWidth;
            this.height = newHeight;
            
            // Update radius for circle
            if (this.type === 'circle') {
                this.radius = Math.max(newWidth, newHeight) / 2;
            }
        }
    }
    
    // Move the shape
    move(dx, dy) {
        this.x += dx;
        this.y += dy;
        
        // For lines, move both endpoints
        if (this.type === 'line') {
            this.endX += dx;
            this.endY += dy;
        }
    }
}

// Drawing functions
function startDrawing(e) {
    isDrawing = true;
    [lastX, lastY] = getMousePos(canvas, e);
    
    // For shapes, record start position
    if (['rectangle', 'circle', 'line'].includes(selectedTool)) {
        startX = lastX;
        startY = lastY;
        // Clear temporary canvas
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    } else if (selectedTool === 'select') {
        // Check if we clicked on a shape
        handleSelectionClick(lastX, lastY);
        return; // Don't proceed with drawing
    }
    
    // For text tool
    if (selectedTool === 'text') {
        createTextInput(lastX, lastY);
    }
}

function draw(e) {
    if (!isDrawing) return;
    
    // Handle selection tool actions
    if (selectedTool === 'select') {
        handleSelectionMove(e);
        return;
    }
    
    const [x, y] = getMousePos(canvas, e);
    
    if (['rectangle', 'circle', 'line'].includes(selectedTool)) {
        drawShapePreview(x, y);
    } else {
        const currentLayer = layers[activeLayerIndex];
        if (!currentLayer || !currentLayer.visible) return;
        
        currentLayer.context.lineJoin = 'round';
        currentLayer.context.lineCap = 'round';
        currentLayer.context.strokeStyle = hexToRgba(currentColor, currentOpacity);
        currentLayer.context.fillStyle = hexToRgba(currentColor, currentOpacity);
        currentLayer.context.lineWidth = currentLineWidth;
        
        switch (selectedTool) {
            case 'brush':
                drawBrush(currentLayer.context, x, y);
                break;
            case 'pencil':
                drawPencil(currentLayer.context, x, y);
                break;
            case 'eraser':
                erase(currentLayer.context, x, y);
                break;
            case 'fill':
                // Fill is handled in mousedown/stopDrawing
                break;
        }
    }
    
    lastX = x;
    lastY = y;
    renderCanvas();
}

function stopDrawing(e) {
    if (!isDrawing) return;
    
    if (selectedTool === 'select') {
        handleSelectionEnd();
        isDrawing = false;
        return;
    }
    
    // For shapes, create shape object and add to current layer
    if (['rectangle', 'circle', 'line'].includes(selectedTool)) {
        const [x, y] = e ? getMousePos(canvas, e) : [lastX, lastY];
        createShape(selectedTool, startX, startY, x, y);
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
    
    // For fill tool
    if (selectedTool === 'fill' && isDrawing) {
        const currentLayer = layers[activeLayerIndex];
        if (currentLayer && currentLayer.visible) {
            floodFill(currentLayer.context, lastX, lastY, currentColor);
        }
    }
    
    isDrawing = false;
    renderCanvas();
    saveState(); // Save state after completing drawing action
}

// Draw shape preview on temp canvas
function drawShapePreview(x, y) {
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.strokeStyle = hexToRgba(currentColor, currentOpacity);
    tempCtx.lineWidth = currentLineWidth;
    
    switch(selectedTool) {
        case 'rectangle':
            tempCtx.beginPath();
            tempCtx.rect(startX, startY, x - startX, y - startY);
            tempCtx.stroke();
            break;
            
        case 'circle':
            const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
            tempCtx.beginPath();
            tempCtx.arc(startX, startY, radius, 0, Math.PI * 2);
            tempCtx.stroke();
            break;
            
        case 'line':
            tempCtx.beginPath();
            tempCtx.moveTo(startX, startY);
            tempCtx.lineTo(x, y);
            tempCtx.stroke();
            break;
    }
}

// Create a shape object and add to the current layer
function createShape(type, startX, startY, endX, endY) {
    const currentLayer = layers[activeLayerIndex];
    if (!currentLayer || !currentLayer.visible) return;
    
    let shape;
    
    switch(type) {
        case 'rectangle':
            // Calculate dimensions
            let width = endX - startX;
            let height = endY - startY;
            let x = startX;
            let y = startY;
            
            // Handle negative dimensions
            if (width < 0) {
                width = Math.abs(width);
                x = endX;
            }
            if (height < 0) {
                height = Math.abs(height);
                y = endY;
            }
            
            shape = new Shape('rectangle', {
                x: x,
                y: y,
                width: width,
                height: height,
                color: currentColor,
                lineWidth: currentLineWidth,
                opacity: currentOpacity,
                layerIndex: activeLayerIndex
            });
            break;
            
        case 'circle':
            const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
            shape = new Shape('circle', {
                x: startX - radius,
                y: startY - radius,
                width: radius * 2,
                height: radius * 2,
                radius: radius,
                color: currentColor,
                lineWidth: currentLineWidth,
                opacity: currentOpacity,
                layerIndex: activeLayerIndex
            });
            break;
            
        case 'line':
            shape = new Shape('line', {
                x: startX,
                y: startY,
                endX: endX,
                endY: endY,
                width: Math.abs(endX - startX),
                height: Math.abs(endY - startY),
                color: currentColor,
                lineWidth: currentLineWidth,
                opacity: currentOpacity,
                layerIndex: activeLayerIndex
            });
            break;
    }
    
    if (shape) {
        // Add shape to the layer
        currentLayer.shapes = currentLayer.shapes || [];
        currentLayer.shapes.push(shape);
        
        // Draw shape to layer canvas
        shape.draw(currentLayer.context);
        
        // Select the newly created shape
        selectShape(shape);
    }
}

// Selection handling
function handleSelectionClick(x, y) {
    // Check if click is on a resize handle
    if (selectedShape) {
        // Check if click is on rotation handle
        const rotationHandleBounds = getRotationHandleBounds();
        if (
            x >= rotationHandleBounds.x - 4 && 
            x <= rotationHandleBounds.x + 4 && 
            y >= rotationHandleBounds.y - 4 && 
            y <= rotationHandleBounds.y + 4
        ) {
            isRotating = true;
            startAngle = Math.atan2(
                y - (selectedShape.y + selectedShape.height / 2), 
                x - (selectedShape.x + selectedShape.width / 2)
            );
            return;
        }
        
        // Check if click is on resize handles
        for (let i = 0; i < selectionHandles.length; i++) {
            const handle = selectionHandles[i];
            const handlePos = handle.dataset.position;
            const handleBounds = getHandleBounds(handlePos);
            
            if (
                x >= handleBounds.x - 4 && 
                x <= handleBounds.x + 4 && 
                y >= handleBounds.y - 4 && 
                y <= handleBounds.y + 4
            ) {
                isResizing = true;
                activeHandle = handlePos;
                return;
            }
        }
    }
    
    // Find a shape that contains this point
    let shape = null;
    
    // Find the topmost shape that contains the point
    for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex--) {
        const layer = layers[layerIndex];
        if (!layer.visible) continue;
        
        if (layer.shapes && layer.shapes.length > 0) {
            // Iterate in reverse to check topmost shapes first
            for (let i = layer.shapes.length - 1; i >= 0; i--) {
                if (layer.shapes[i].containsPoint(x, y)) {
                    shape = layer.shapes[i];
                    break;
                }
            }
        }
        
        if (shape) break;
    }
    
    // If we found a shape, select it
    if (shape) {
        selectShape(shape);
        isDragging = true; // Start dragging the shape
    } else {
        // Deselect if clicking empty area
        deselectShape();
    }
}

function handleSelectionMove(e) {
    const [x, y] = getMousePos(canvas, e);
    
    if (isResizing && selectedShape) {
        // Get the bounds before resize
        const bounds = selectedShape.getBounds();
        let newWidth = bounds.width;
        let newHeight = bounds.height;
        let newX = selectedShape.x;
        let newY = selectedShape.y;
        
        // Calculate resize based on handle position
        switch (activeHandle) {
            case 'tl': // top-left
                newWidth = bounds.width + (bounds.x - x);
                newHeight = bounds.height + (bounds.y - y);
                newX = x;
                newY = y;
                break;
            case 't': // top
                newHeight = bounds.height + (bounds.y - y);
                newY = y;
                break;
            case 'tr': // top-right
                newWidth = x - bounds.x;
                newHeight = bounds.height + (bounds.y - y);
                newY = y;
                break;
            case 'r': // right
                newWidth = x - bounds.x;
                break;
            case 'br': // bottom-right
                newWidth = x - bounds.x;
                newHeight = y - bounds.y;
                break;
            case 'b': // bottom
                newHeight = y - bounds.y;
                break;
            case 'bl': // bottom-left
                newWidth = bounds.width + (bounds.x - x);
                newHeight = y - bounds.y;
                newX = x;
                break;
            case 'l': // left
                newWidth = bounds.width + (bounds.x - x);
                newX = x;
                break;
        }
        
        // Don't allow negative width/height
        if (newWidth > 1) selectedShape.x = newX;
        if (newHeight > 1) selectedShape.y = newY;
        
        // Update shape dimensions
        selectedShape.resize(
            Math.max(newWidth, 1),
            Math.max(newHeight, 1)
        );
        
        // Update form controls
        shapeWidthInput.value = Math.round(Math.abs(selectedShape.width));
        shapeHeightInput.value = Math.round(Math.abs(selectedShape.height));
        
        // Redraw canvas with updated shape
        redrawLayerWithShapes(selectedShape.layerIndex);
        renderCanvas();
    } 
    else if (isRotating && selectedShape) {
        const centerX = selectedShape.x + selectedShape.width / 2;
        const centerY = selectedShape.y + selectedShape.height / 2;
        
        const currentAngle = Math.atan2(y - centerY, x - centerX);
        const angleDiff = currentAngle - startAngle;
        const rotationDegrees = angleDiff * (180 / Math.PI);
        
        // Update shape rotation
        selectedShape.rotation = (selectedShape.rotation + rotationDegrees) % 360;
        startAngle = currentAngle;
        
        // Update rotation input
        shapeRotationInput.value = Math.round(selectedShape.rotation);
        rotationValue.textContent = `${Math.round(selectedShape.rotation)}°`;
        
        // Redraw
        redrawLayerWithShapes(selectedShape.layerIndex);
        renderCanvas();
    }
    else if (isDragging && selectedShape) {
        const dx = x - lastX;
        const dy = y - lastY;
        
        // Move the shape
        selectedShape.move(dx, dy);
        
        // Redraw
        redrawLayerWithShapes(selectedShape.layerIndex);
        renderCanvas();
    }
    
    lastX = x;
    lastY = y;
}

function handleSelectionEnd() {
    isDragging = false;
    isResizing = false;
    isRotating = false;
    activeHandle = null;
    saveState(); // Save state when finishing a selection action
}

function selectShape(shape) {
    selectedShape = shape;
    shapeWidthInput.value = Math.round(shape.width);
    shapeHeightInput.value = Math.round(shape.height);
    shapeRotationInput.value = Math.round(shape.rotation);
    rotationValue.textContent = `${Math.round(shape.rotation)}°`;
    
    // Show shape controls
    shapeControls.style.display = 'block';
    
    updateSelectionUI();
}

function deselectShape() {
    selectedShape = null;
    
    // Hide selection UI
    selectionBox.style.display = 'none';
    selectionHandles.forEach(handle => handle.style.display = 'none');
    rotationHandle.style.display = 'none';
    
    // Hide shape controls
    shapeControls.style.display = 'none';
}

function updateSelectionUI() {
    if (!selectedShape) return;
    
    const canvasRect = canvas.getBoundingClientRect();
    const bounds = selectedShape.getBounds();
    
    // Position selection box (accounting for canvas scaling/positioning)
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    
    // Apply rotation to selection box
    selectionBox.style.width = `${bounds.width * scaleX}px`;
    selectionBox.style.height = `${bounds.height * scaleY}px`;
    selectionBox.style.left = `${bounds.x * scaleX + canvasRect.left}px`;
    selectionBox.style.top = `${bounds.y * scaleY + canvasRect.top}px`;
    selectionBox.style.transform = `rotate(${selectedShape.rotation}deg)`;
    selectionBox.style.transformOrigin = 'center';
    selectionBox.style.display = 'block';
    
    // Position handles
    updateHandles(bounds, canvasRect, scaleX, scaleY);
    
    // Position rotation handle
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y - 20; // Position above the shape
    rotationHandle.style.left = `${centerX * scaleX + canvasRect.left}px`;
    rotationHandle.style.top = `${centerY * scaleY + canvasRect.top}px`;
    rotationHandle.style.display = 'block';
}

function updateHandles(bounds, canvasRect, scaleX, scaleY) {
    const handlePositions = [
        { pos: 'tl', x: bounds.x, y: bounds.y }, // top-left
        { pos: 't', x: bounds.x + bounds.width / 2, y: bounds.y }, // top
        { pos: 'tr', x: bounds.x + bounds.width, y: bounds.y }, // top-right
        { pos: 'r', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 }, // right
        { pos: 'br', x: bounds.x + bounds.width, y: bounds.y + bounds.height }, // bottom-right
        { pos: 'b', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }, // bottom
        { pos: 'bl', x: bounds.x, y: bounds.y + bounds.height }, // bottom-left
        { pos: 'l', x: bounds.x, y: bounds.y + bounds.height / 2 } // left
    ];
    
    selectionHandles.forEach((handle, index) => {
        const pos = handlePositions[index];
        
        // Calculate rotated handle position
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const angle = selectedShape.rotation * Math.PI / 180;
        
        // Translate to origin
        let relativeX = pos.x - centerX;
        let relativeY = pos.y - centerY;
        
        // Rotate
        const rotatedX = relativeX * Math.cos(angle) - relativeY * Math.sin(angle);
        const rotatedY = relativeX * Math.sin(angle) + relativeY * Math.cos(angle);
        
        // Translate back
        const finalX = rotatedX + centerX;
        const finalY = rotatedY + centerY;
        
        handle.style.left = `${finalX * scaleX + canvasRect.left}px`;
        handle.style.top = `${finalY * scaleY + canvasRect.top}px`;
        handle.style.display = 'block';
    });
}

function getHandleBounds(position) {
    if (!selectedShape) return { x: 0, y: 0 };
    
    const bounds = selectedShape.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    
    let x, y;
    
    switch (position) {
        case 'tl': x = bounds.x; y = bounds.y; break;
        case 't': x = centerX; y = bounds.y; break;
        case 'tr': x = bounds.x + bounds.width; y = bounds.y; break;
        case 'r': x = bounds.x + bounds.width; y = centerY; break;
        case 'br': x = bounds.x + bounds.width; y = bounds.y + bounds.height; break;
        case 'b': x = centerX; y = bounds.y + bounds.height; break;
        case 'bl': x = bounds.x; y = bounds.y + bounds.height; break;
        case 'l': x = bounds.x; y = centerY; break;
    }
    
    // Apply rotation
    const angle = selectedShape.rotation * Math.PI / 180;
    
    // Translate to origin
    let relativeX = x - centerX;
    let relativeY = y - centerY;
    
    // Rotate
    const rotatedX = relativeX * Math.cos(angle) - relativeY * Math.sin(angle);
    const rotatedY = relativeX * Math.sin(angle) + relativeY * Math.cos(angle);
    
    // Translate back
    x = rotatedX + centerX;
    y = rotatedY + centerY;
    
    return { x, y };
}

function getRotationHandleBounds() {
    if (!selectedShape) return { x: 0, y: 0 };
    
    const bounds = selectedShape.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y - 20; // Position above the shape
    
    // Apply rotation to position
    const angle = selectedShape.rotation * Math.PI / 180;
    const mainCenterX = bounds.x + bounds.width / 2;
    const mainCenterY = bounds.y + bounds.height / 2;
    
    // Translate to origin
    let relativeX = centerX - mainCenterX;
    let relativeY = centerY - mainCenterY;
    
    // Rotate
    const rotatedX = relativeX * Math.cos(angle) - relativeY * Math.sin(angle);
    const rotatedY = relativeX * Math.sin(angle) + relativeY * Math.cos(angle);
    
    // Translate back
    const x = rotatedX + mainCenterX;
    const y = rotatedY + mainCenterY;
    
    return { x, y };
}

function redrawLayerWithShapes(layerIndex) {
    const layer = layers[layerIndex];
    if (!layer) return;
    
    // Clear layer
    layer.context.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    
    // If it's background layer, fill with white
    if (layerIndex === 0) {
        layer.context.fillStyle = '#ffffff';
        layer.context.fillRect(0, 0, layer.canvas.width, layer.canvas.height);
    }
    
    // Redraw all shapes
    if (layer.shapes && layer.shapes.length > 0) {
        layer.shapes.forEach(shape => {
            shape.draw(layer.context);
        });
    }
}

// Tool implementations
function drawBrush(context, x, y) {
    context.beginPath();
    context.moveTo(lastX, lastY);
    context.lineTo(x, y);
    context.stroke();
}

function drawPencil(context, x, y) {
    context.beginPath();
    context.moveTo(lastX, lastY);
    context.lineTo(x, y);
    context.stroke();
}

function erase(context, x, y) {
    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    context.arc(x, y, currentLineWidth / 2, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'source-over';
}

function createTextInput(x, y) {
    // Remove any existing text input
    removeTextInput();
    
    // Create a text input at the cursor position
    textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.style.position = 'absolute';
    textInput.style.left = `${x + canvas.offsetLeft}px`;
    textInput.style.top = `${y + canvas.offsetTop}px`;
    textInput.style.backgroundColor = 'transparent';
    textInput.style.border = '1px dashed #333';
    textInput.style.font = `${currentLineWidth * 3}px Arial`;
    textInput.style.color = currentColor;
    textInput.style.zIndex = 100;
    
    // Add event listener to commit text on enter or blur
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            commitText(textInput.value, x, y);
        }
    });
    
    textInput.addEventListener('blur', () => {
        commitText(textInput.value, x, y);
    });
    
    document.body.appendChild(textInput);
    textInput.focus();
}

function commitText(text, x, y) {
    if (text && text.trim()) {
        const currentLayer = layers[activeLayerIndex];
        if (currentLayer && currentLayer.visible) {
            currentLayer.context.font = `${currentLineWidth * 3}px Arial`;
            currentLayer.context.fillStyle = hexToRgba(currentColor, currentOpacity);
            currentLayer.context.fillText(text, x, y + currentLineWidth * 3);
            renderCanvas();
            saveState();
        }
    }
    removeTextInput();
}

function removeTextInput() {
    if (textInput && textInput.parentNode) {
        textInput.parentNode.removeChild(textInput);
        textInput = null;
    }
}

// Utility functions
function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return [
        (evt.clientX - rect.left) * scaleX,
        (evt.clientY - rect.top) * scaleY
    ];
}

function hexToRgba(hex, opacity) {
    const bigint = parseInt(hex.substring(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Simple flood fill algorithm
function floodFill(context, x, y, fillColor) {
    // Get image data
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Get clicked color
    const targetColor = getColorAtPixel(imageData, x, y);
    const fillColorRGB = hexToRgb(fillColor);
    
    // If target color and fill color are the same, return
    if (colorsMatch(targetColor, fillColorRGB)) {
        return;
    }
    
    // Flood fill algorithm
    const pixelsToCheck = [{x: x, y: y}];
    
    while (pixelsToCheck.length > 0) {
        const pixel = pixelsToCheck.pop();
        const pos = (pixel.y * canvas.width + pixel.x) * 4;
        
        if (
            pixel.x >= 0 && pixel.x < canvas.width &&
            pixel.y >= 0 && pixel.y < canvas.height &&
            colorsMatch(getColorAtPosition(data, pos), targetColor)
        ) {
            setColorAtPosition(data, pos, fillColorRGB);
            
            pixelsToCheck.push({x: pixel.x + 1, y: pixel.y});
            pixelsToCheck.push({x: pixel.x - 1, y: pixel.y});
            pixelsToCheck.push({x: pixel.x, y: pixel.y + 1});
            pixelsToCheck.push({x: pixel.x, y: pixel.y - 1});
        }
    }
    
    context.putImageData(imageData, 0, 0);
}

function getColorAtPixel(imageData, x, y) {
    const pos = (Math.floor(y) * imageData.width + Math.floor(x)) * 4;
    return getColorAtPosition(imageData.data, pos);
}

function getColorAtPosition(data, pos) {
    return {
        r: data[pos],
        g: data[pos + 1],
        b: data[pos + 2],
        a: data[pos + 3]
    };
}

function setColorAtPosition(data, pos, color) {
    data[pos] = color.r;
    data[pos + 1] = color.g;
    data[pos + 2] = color.b;
    data[pos + 3] = 255; // Alpha
}

function colorsMatch(a, b) {
    // Check if colors are similar (allow for small differences)
    const tolerance = 5;
    return Math.abs(a.r - b.r) <= tolerance &&
           Math.abs(a.g - b.g) <= tolerance &&
           Math.abs(a.b - b.b) <= tolerance;
}

function hexToRgb(hex) {
    const bigint = parseInt(hex.substring(1), 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
        a: 255
    };
}

// History management
function saveState() {
    // First remove any states after current position if we've gone back
    if (historyIndex < canvasHistory.length - 1) {
        canvasHistory = canvasHistory.slice(0, historyIndex + 1);
    }
    
    // Create a copy of all layers
    const layersCopy = layers.map(layer => {
        const newCanvas = document.createElement('canvas');
        newCanvas.width = layer.canvas.width;
        newCanvas.height = layer.canvas.height;
        const newContext = newCanvas.getContext('2d');
        newContext.drawImage(layer.canvas, 0, 0);
        
        return {
            name: layer.name,
            canvas: newCanvas,
            context: newContext,
            visible: layer.visible
        };
    });
    
    // Push to history
    canvasHistory.push({
        layers: layersCopy,
        activeLayerIndex: activeLayerIndex
    });
    
    // Limit history size
    if (canvasHistory.length > 20) {
        canvasHistory.shift();
    } else {
        historyIndex++;
    }
    
    updateUndoRedoButtons();
}

function undo() {
    if (historyIndex <= 0) return;
    
    historyIndex--;
    restoreState();
    updateUndoRedoButtons();
}

function redo() {
    if (historyIndex >= canvasHistory.length - 1) return;
    
    historyIndex++;
    restoreState();
    updateUndoRedoButtons();
}

function restoreState() {
    const state = canvasHistory[historyIndex];
    if (!state) return;
    
    layers = state.layers.map(layer => {
        const newCanvas = document.createElement('canvas');
        newCanvas.width = layer.canvas.width;
        newCanvas.height = layer.canvas.height;
        const newContext = newCanvas.getContext('2d');
        newContext.drawImage(layer.canvas, 0, 0);
        
        return {
            name: layer.name,
            canvas: newCanvas,
            context: newContext,
            visible: layer.visible
        };
    });
    
    activeLayerIndex = state.activeLayerIndex;
    updateLayersPanel();
    renderCanvas();
}

function updateUndoRedoButtons() {
    undoButton.disabled = historyIndex <= 0;
    redoButton.disabled = historyIndex >= canvasHistory.length - 1;
}

// Event listeners
function setupEventListeners() {
    // Drawing events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Touch support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        startDrawing(mouseEvent);
    });
    
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        draw(mouseEvent);
    });
    
    canvas.addEventListener('touchend', () => {
        stopDrawing();
    });
    
    // Tool selection
    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Clear previous selections
            toolButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            selectedTool = button.dataset.tool;
            
            // If selecting a drawing tool, deselect any shape
            if (selectedTool !== 'select' && selectedShape) {
                deselectShape();
            }
            
            // Change cursor based on tool
            if (selectedTool === 'fill') {
                canvas.style.cursor = 'url("images/bucket.png"), auto';
            } else if (selectedTool === 'text') {
                canvas.style.cursor = 'text';
            } else if (selectedTool === 'select') {
                canvas.style.cursor = 'pointer';
            } else {
                canvas.style.cursor = 'crosshair';
            }
        });
    });
    
    // Default active tool
    document.querySelector('[data-tool="brush"]').classList.add('active');
    
    // Color selection
    colorPicker.addEventListener('input', () => {
        currentColor = colorPicker.value;
        addToRecentColors(currentColor);
    });
    
    colorButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Clear previous selections
            colorButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentColor = button.dataset.color;
            colorPicker.value = currentColor;
            addToRecentColors(currentColor);
        });
    });
    
    // Options
    lineWidthInput.addEventListener('input', () => {
        currentLineWidth = parseInt(lineWidthInput.value);
    });
    
    transparencyInput.addEventListener('input', () => {
        currentOpacity = transparencyInput.value / 100;
    });
    
    // Actions
    clearButton.addEventListener('click', () => {
        if (confirm('Clear the current layer?')) {
            const currentLayer = layers[activeLayerIndex];
            currentLayer.context.clearRect(0, 0, canvas.width, canvas.height);
            
            // If it's the background layer, fill with white
            if (activeLayerIndex === 0) {
                currentLayer.context.fillStyle = '#ffffff';
                currentLayer.context.fillRect(0, 0, canvas.width, canvas.height);
            }
            
            // Clear shapes array for this layer
            if (currentLayer.shapes) {
                currentLayer.shapes = [];
            }
            
            renderCanvas();
            saveState();
        }
    });
    
    saveButton.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = 'aryan-paint-artwork.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
    
    undoButton.addEventListener('click', undo);
    redoButton.addEventListener('click', redo);
    
    // Layer controls
    addLayerButton.addEventListener('click', () => {
        createLayer();
        saveState();
    });
    
    deleteLayerButton.addEventListener('click', () => {
        if (layers.length <= 1) {
            alert('Cannot delete the last layer!');
            return;
        }
        
        if (confirm('Delete the current layer?')) {
            layers.splice(activeLayerIndex, 1);
            activeLayerIndex = Math.min(activeLayerIndex, layers.length - 1);
            updateLayersPanel();
            renderCanvas();
            saveState();
        }
    });
    
    mergeLayerButton.addEventListener('click', () => {
        if (activeLayerIndex === 0 || layers.length <= 1) {
            alert('Cannot merge: Need at least two layers and active layer cannot be the bottom layer!');
            return;
        }
        
        if (confirm('Merge current layer down?')) {
            const targetLayerIndex = activeLayerIndex - 1;
            const targetLayer = layers[targetLayerIndex];
            const sourceLayer = layers[activeLayerIndex];
            
            // Draw the source layer onto the target layer
            if (sourceLayer.visible) {
                targetLayer.context.drawImage(sourceLayer.canvas, 0, 0);
            }
            
            // Merge shapes arrays if they exist
            if (sourceLayer.shapes && sourceLayer.shapes.length > 0) {
                if (!targetLayer.shapes) targetLayer.shapes = [];
                sourceLayer.shapes.forEach(shape => {
                    // Copy each shape with updated layer index
                    const shapeCopy = new Shape(shape.type, {
                        x: shape.x,
                        y: shape.y,
                        width: shape.width,
                        height: shape.height,
                        radius: shape.radius,
                        endX: shape.endX,
                        endY: shape.endY,
                        color: shape.color,
                        lineWidth: shape.lineWidth,
                        opacity: shape.opacity,
                        rotation: shape.rotation,
                        layerIndex: targetLayerIndex
                    });
                    targetLayer.shapes.push(shapeCopy);
                });
            }
            
            // Remove the source layer
            layers.splice(activeLayerIndex, 1);
            activeLayerIndex = targetLayerIndex;
            
            updateLayersPanel();
            renderCanvas();
            saveState();
        }
    });
    
    // Window resize handling
    window.addEventListener('resize', () => {
        // Save current state
        const imageData = canvas.toDataURL('image/png');
        
        // Resize canvas
        canvas.width = window.innerWidth - 420;
        canvas.height = window.innerHeight - 40;
        
        // Resize all layer canvases
        layers.forEach(layer => {
            const newCanvas = document.createElement('canvas');
            newCanvas.width = canvas.width;
            newCanvas.height = canvas.height;
            
            const newContext = newCanvas.getContext('2d');
            newContext.drawImage(layer.canvas, 0, 0);
            
            layer.canvas = newCanvas;
            layer.context = newContext;
        });
        
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        
        renderCanvas();
    });
}

// Recent colors
function addToRecentColors(color) {
    const recentColorsContainer = document.querySelector('.recent-colors');
    
    // Check if color already exists in recent colors
    const existingColor = recentColorsContainer.querySelector(`[data-color="${color}"]`);
    if (existingColor) return;
    
    // Add new color
    const colorEl = document.createElement('div');
    colorEl.className = 'recent-color';
    colorEl.style.backgroundColor = color;
    colorEl.dataset.color = color;
    colorEl.addEventListener('click', () => {
        currentColor = color;
        colorPicker.value = color;
    });
    
    // Limit to 10 recent colors
    if (recentColorsContainer.children.length >= 10) {
        recentColorsContainer.removeChild(recentColorsContainer.firstChild);
    }
    
    recentColorsContainer.appendChild(colorEl);
}

// Event listeners for shape controls
function setupShapeControls() {
    shapeWidthInput.addEventListener('change', () => {
        if (!selectedShape) return;
        
        const newWidth = parseInt(shapeWidthInput.value);
        if (isNaN(newWidth) || newWidth < 1) return;
        
        selectedShape.resize(newWidth, selectedShape.height);
        redrawLayerWithShapes(selectedShape.layerIndex);
        renderCanvas();
        saveState();
    });
    
    shapeHeightInput.addEventListener('change', () => {
        if (!selectedShape) return;
        
        const newHeight = parseInt(shapeHeightInput.value);
        if (isNaN(newHeight) || newHeight < 1) return;
        
        selectedShape.resize(selectedShape.width, newHeight);
        redrawLayerWithShapes(selectedShape.layerIndex);
        renderCanvas();
        saveState();
    });
    
    shapeRotationInput.addEventListener('input', () => {
        if (!selectedShape) return;
        
        const newRotation = parseInt(shapeRotationInput.value);
        if (isNaN(newRotation)) return;
        
        selectedShape.rotation = newRotation;
        rotationValue.textContent = `${newRotation}°`;
        redrawLayerWithShapes(selectedShape.layerIndex);
        renderCanvas();
    });
    
    shapeRotationInput.addEventListener('change', () => {
        saveState(); // Save when rotation is complete
    });
    
    deleteShapeBtn.addEventListener('click', () => {
        if (!selectedShape) return;
        
        // Find and delete the shape
        const layer = layers[selectedShape.layerIndex];
        if (layer && layer.shapes) {
            const index = layer.shapes.findIndex(s => s === selectedShape);
            if (index !== -1) {
                layer.shapes.splice(index, 1);
                redrawLayerWithShapes(selectedShape.layerIndex);
                deselectShape();
                renderCanvas();
                saveState();
            }
        }
    });
}

// Add shape controls setup to the init function
function init() {
    initCanvas();
    setupEventListeners();
    setupShapeControls();
}

// Start the app when the window loads
window.addEventListener('load', init);
