// Import required vision module from MediaPipe using CDN
import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision;

// Global variables
let faceLandmarker;
let webcamRunning = false;
let selectedKey = null;
let gazedKey = null;
let blinkStartTime = null;
let selectedText = '';

// DOM elements
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const enableWebcamButton = document.getElementById("webcamButton");
const faceOutput = document.getElementById("face_output");

// Initialization
async function initialize() {
  await createFaceLandmarker();
  enableWebcamButton.addEventListener("click", enableCam);
  document.addEventListener('DOMContentLoaded', () => {
    initializeKeys();
    updateSelectedText(); // Initialize the selected text field
  });
}

async function createFaceLandmarker() {
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "CPU"
    },
    outputFaceBlendshapes: true,
    runningMode: "VIDEO",
    numFaces: 1
  });
}

// Main prediction function
async function predictWebcam() {
  updateCanvasSize();

  if (webcamRunning) {
    const startTimeMs = performance.now();
    const faceResults = await faceLandmarker.detectForVideo(video, startTimeMs);

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (faceResults.faceLandmarks) {
      processFaceLandmarks(faceResults.faceLandmarks);
    } else {
      faceOutput.innerText = "No face landmarks detected.";
    }

    window.requestAnimationFrame(predictWebcam);
  }
}

function processFaceLandmarks(faceLandmarks) {
  const drawingUtils = new DrawingUtils(canvasCtx);
  faceOutput.innerText = "Face landmarks detected.";
  
  for (const landmarks of faceLandmarks) {
    drawFaceLandmarks(drawingUtils, landmarks);
    detectGazedKey(landmarks);
    detectBlink(landmarks);
  }
  
  drawDetectionResults();
}

function drawFaceLandmarks(drawingUtils, landmarks) {
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_TESSELATION,
    { color: "#C0C0C070", lineWidth: 1 }
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
    { color: "#83f47e" } // Right eyebrow color (#FF3030 is default) ff5722 is orange
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    { color: "#83f47e" } // Right eye color (#FF3030 is default) ff5722 is orange
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
    { color: "#83f47e" } // Right iris color (#FF3030 is default) ff5722 is orange
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
    { color: "#83f47e" } // Green left eyebrow color (#30FF30 is default)
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    { color: "#83f47e" } // Green left eye color (#30FF30 is default)
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
    { color: "#83f47e" } // Green left iris color (#30FF30 is default)
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
    { color: "#E0E0E0" } // face outline color
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_LIPS,
    { color: "#E0E0E0" } // Lips color (#E0E0E0 is default)
  );
}

function drawDetectionResults() {
  canvasCtx.fillStyle = "white";
  canvasCtx.font = "20px Arial";
  canvasCtx.fillText(`Selected Text: ${selectedText}`, 10, 30);

  if (gazedKey) {
    canvasCtx.fillStyle = "rgba(255, 255, 255, 0.7)";
    canvasCtx.fillRect(0, canvasElement.height - 100, canvasElement.width, 100);
    canvasCtx.fillStyle = "black";
    canvasCtx.font = "60px Arial";
    canvasCtx.textAlign = "center";
    canvasCtx.fillText(gazedKey, canvasElement.width / 2, canvasElement.height - 30);
    console.log(`Gazed Key: ${gazedKey}`);
  }
}

function detectGazedKey(landmarks) {
  const leftEye = landmarks[159]; // Left eye center
  const rightEye = landmarks[386]; // Right eye center
  const noseTop = landmarks[168]; // Nose bridge top

  const gazeX = (leftEye.x + rightEye.x) / 2;
  const gazeY = (leftEye.y + rightEye.y + noseTop.y) / 3;

  const keys = document.querySelectorAll('.key');
  gazedKey = null;

  keys.forEach(key => {
    const rect = key.getBoundingClientRect();
    const keyX = (rect.left + rect.right) / 2 / window.innerWidth;
    const keyY = (rect.top + rect.bottom) / 2 / window.innerHeight;

    const distance = Math.sqrt(Math.pow(gazeX - keyX, 2) + Math.pow(gazeY - keyY, 2));

    if (distance < 0.1) { // Adjust this threshold as needed
      gazedKey = key.textContent;
      console.log(`Gazing at key: ${gazedKey}`);
    }
  });
}

function detectBlink(landmarks) {
  const leftEyeUpper = landmarks[159]; // Left eye upper lid
  const leftEyeLower = landmarks[145]; // Left eye lower lid
  const rightEyeUpper = landmarks[386]; // Right eye upper lid
  const rightEyeLower = landmarks[374]; // Right eye lower lid

  const leftEyeDistance = Math.abs(leftEyeUpper.y - leftEyeLower.y);
  const rightEyeDistance = Math.abs(rightEyeUpper.y - rightEyeLower.y);

  const blinkThreshold = 0.02; // Adjust this value as needed

  if (leftEyeDistance < blinkThreshold && rightEyeDistance < blinkThreshold) {
    if (blinkStartTime === null) {
      blinkStartTime = performance.now();
    } else {
      const blinkDuration = performance.now() - blinkStartTime;
      if (blinkDuration > 1000 && gazedKey) { // Long blink detected (> 1 second)
        selectKey(gazedKey);
        console.log(`Long blink detected. Selected key: ${gazedKey}`);
      }
    }
  } else {
    blinkStartTime = null;
  }
}

function selectKey(key) {
  selectedText += key;
  updateSelectedText();
}

function updateSelectedText() {
  const selectedTextField = document.getElementById('selectedText');
  selectedTextField.textContent = selectedText;
  console.log(`Updated selected text: ${selectedText}`);
}

function enableCam() {
  if (!faceLandmarker) {
    console.log("Wait! Model not loaded yet.");
    return;
  }

  webcamRunning = !webcamRunning;
  enableWebcamButton.innerText = webcamRunning ? "DISABLE FACE" : "DETECT FACE";

  const constraints = {
    video: { width: 1280, height: 720 }
  };

  if (webcamRunning) {
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      video.srcObject = stream;
      video.addEventListener("loadeddata", predictWebcam);
    });
  } else {
    const stream = video.srcObject;
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      video.srcObject = null;
    }
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  }
}

function updateCanvasSize() {
  const videoRatio = video.videoHeight / video.videoWidth;
  video.style.width = '100%';
  video.style.height = 'auto';
  canvasElement.style.width = '100%';
  canvasElement.style.height = 'auto';
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;
}

function initializeKeys() {
  const keys = document.querySelectorAll('.key');
  keys.forEach(key => {
    key.addEventListener('focus', () => {
      selectedKey = key.textContent;
    });
  });

  document.getElementById('key-h').focus();
}

// Start the initialization
initialize();