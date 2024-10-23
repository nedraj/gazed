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
let gazeRatio = 0; // Add this global variable
let leftEyeDirection = 0;
let rightEyeDirection = 0;

// Add these global variables
const keyboardLayout = 'qwertyuiopasdfghjklzxcvbnm'.split('');
let currentLetterIndex = 0;

// Add these global variables
let leftLookDuration = 0;
let rightLookDuration = 0;
const DIRECTION_THRESHOLD = 40; // Assuming 30 fps, this is 2 seconds

// Add these global variables
const KEYBOARD_MODE = 'keyboard';
const TOOLBAR_MODE = 'toolbar';
let currentMode = KEYBOARD_MODE;
const TOOLBAR_OPTIONS = ['Search', 'Space', 'Speak', 'Send', 'Delete'];
let currentToolbarIndex = 0;

// Add this global variable for mode switching
const MODE_SWITCH_THRESHOLD = 120; // 120 frames for switching modes
let centerLookDuration = 0;

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
    // Remove initializeKeys() if it's no longer needed
    updateSelectedText(); // Initialize the selected text field
  });
  createSearchButton();
  createButtons();
  setUpVoice();
  createVoiceMenu();
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
      faceOutput.innerText = "Nothing detected.";
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
  canvasCtx.fillText(`Gaze Ratio: ${gazeRatio.toFixed(2)}`, 10, 60);
  canvasCtx.fillText(`Left Eye Direction: ${leftEyeDirection.toFixed(2)}`, 10, 90);
  canvasCtx.fillText(`Right Eye Direction: ${rightEyeDirection.toFixed(2)}`, 10, 120);
  
  let gazeDirection;
  if (gazeRatio < -3.5
  ) {
    gazeDirection = "Looking Left";
  } else if (gazeRatio > -2) {
    gazeDirection = "Looking Right";
  } else {
    gazeDirection = "Looking Center";
  }
  canvasCtx.fillText(`Gaze Direction: ${gazeDirection}`, 10, 150);

  // Display the current mode
  canvasCtx.fillText(`Current Mode: ${currentMode}`, 10, 240);

  // Display the current letter or toolbar option
  canvasCtx.fillStyle = "rgba(255, 255, 255, 0.7)";
  canvasCtx.fillRect(0, canvasElement.height - 100, canvasElement.width, 100);
  canvasCtx.fillStyle = "black";
  canvasCtx.font = "60px Arial";
  canvasCtx.textAlign = "center";
  if (currentMode === KEYBOARD_MODE) {
    canvasCtx.fillText(keyboardLayout[currentLetterIndex], canvasElement.width / 2, canvasElement.height - 30);
  } else {
    canvasCtx.fillText(TOOLBAR_OPTIONS[currentToolbarIndex], canvasElement.width / 2, canvasElement.height - 30);
  }

  // Display the center look duration for mode switching
  canvasCtx.fillStyle = "white";
  canvasCtx.font = "20px Arial";
  canvasCtx.textAlign = "left";
  canvasCtx.fillText(`Center Look Duration: ${centerLookDuration}`, 10, 270);

  canvasCtx.fillText(`Left Look Duration: ${leftLookDuration}`, 10, 180);
  canvasCtx.fillText(`Right Look Duration: ${rightLookDuration}`, 10, 210);
}

function getEyeDirection(landmarks, eye) {
  let leftCorner, rightCorner, topEyelid, bottomEyelid, irisCenter;

  if (eye === 'left') {
    leftCorner = landmarks[263];
    rightCorner = landmarks[362];
    topEyelid = landmarks[386];
    bottomEyelid = landmarks[374];
    irisCenter = landmarks[468];
  } else {
    leftCorner = landmarks[33];
    rightCorner = landmarks[133];
    topEyelid = landmarks[159];
    bottomEyelid = landmarks[145];
    irisCenter = landmarks[473];
  }

  const eyeWidth = Math.abs(rightCorner.x - leftCorner.x);
  const eyeHeight = Math.abs(topEyelid.y - bottomEyelid.y);

  // Calculate the iris position relative to the eye corners
  const irisPosition = (irisCenter.x - leftCorner.x) / eyeWidth;

  // Normalize to a range from -1 (far left) to 1 (far right)
  const normalizedPosition = (irisPosition - 0.5) * 2;

  // Apply a non-linear transformation to emphasize small movements
  return Math.sign(normalizedPosition) * Math.pow(Math.abs(normalizedPosition), 1.5);
}

function detectGazedKey(landmarks) {
  leftEyeDirection = getEyeDirection(landmarks, 'left');
  rightEyeDirection = getEyeDirection(landmarks, 'right');

  // Average the directions from both eyes
  gazeRatio = (leftEyeDirection + rightEyeDirection) / 2;

  console.log("Gaze direction:", gazeRatio);

  let newDirection = '';
  if (gazeRatio < -3.5) {
    leftLookDuration++;
    rightLookDuration = 0;
    centerLookDuration = 0;
    if (leftLookDuration >= DIRECTION_THRESHOLD) {
      newDirection = 'left';
      leftLookDuration = 0; // Reset after changing letter
    }
  } else if (gazeRatio > -2) {
    rightLookDuration++;
    leftLookDuration = 0;
    centerLookDuration = 0;
    if (rightLookDuration >= DIRECTION_THRESHOLD) {
      newDirection = 'right';
      rightLookDuration = 0; // Reset after changing letter
    }
  } else {
    // Looking center
    centerLookDuration++;
    leftLookDuration = 0;
    rightLookDuration = 0;
    if (centerLookDuration >= MODE_SWITCH_THRESHOLD) {
      switchMode();
      centerLookDuration = 0; // Reset after switching mode
    }
  }

  // Change the letter or toolbar option if a new direction is detected
  if (newDirection) {
    let previousLetterIndex = currentLetterIndex;
    if (currentMode === KEYBOARD_MODE) {
      if (newDirection === 'right') {
        currentLetterIndex = (currentLetterIndex + 1) % keyboardLayout.length;
      } else if (newDirection === 'left') {
        currentLetterIndex = (currentLetterIndex - 1 + keyboardLayout.length) % keyboardLayout.length;
      }
      if (currentLetterIndex !== previousLetterIndex) {
        gazedKey = keyboardLayout[currentLetterIndex];
        speakLetter(gazedKey);
      }
    } else if (currentMode === TOOLBAR_MODE) {
      if (newDirection === 'right') {
        currentToolbarIndex = (currentToolbarIndex + 1) % TOOLBAR_OPTIONS.length;
      } else if (newDirection === 'left') {
        currentToolbarIndex = (currentToolbarIndex - 1 + TOOLBAR_OPTIONS.length) % TOOLBAR_OPTIONS.length;
      }
      speakLetter(TOOLBAR_OPTIONS[currentToolbarIndex]);
    }
    console.log(`Gazing at: ${currentMode === KEYBOARD_MODE ? gazedKey : TOOLBAR_OPTIONS[currentToolbarIndex]}`);
  }
}

function addSpace() {
  selectedText += ' ';
  updateSelectedText();
  console.log("Space added");
}
const SEARCH_TRIGGER_LENGTH = 5; // Trigger search after 5 characters

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
      if (blinkDuration > BLINK_DURATION_THRESHOLD) {
        if (currentMode === KEYBOARD_MODE) {
          selectKey(keyboardLayout[currentLetterIndex]);
        } else if (currentMode === TOOLBAR_MODE) {
          activateToolbarOption(TOOLBAR_OPTIONS[currentToolbarIndex]);
        }
        console.log(`Long blink detected. Activated: ${currentMode === KEYBOARD_MODE ? keyboardLayout[currentLetterIndex] : TOOLBAR_OPTIONS[currentToolbarIndex]}`);
        blinkStartTime = null;
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
  if (selectedTextField) {
    selectedTextField.textContent = selectedText;
    console.log(`Updated selected text: ${selectedText}`);
  } else {
    console.error('Selected text field not found');
  }
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

// Start the initialization
initialize();

const gazeHistory = [];
const HISTORY_LENGTH = 5; // Adjust this value to change smoothing amount

function smoothGazeRatio(newRatio) {
  gazeHistory.push(newRatio);
  if (gazeHistory.length > HISTORY_LENGTH) {
    gazeHistory.shift();
  }
  return gazeHistory.reduce((a, b) => a + b, 0) / gazeHistory.length;
}

const BLINK_DURATION_THRESHOLD = 1000; // 1000 ms (1 second) for a long blink

function createSearchButton() {
  const searchButton = document.createElement('button');
  searchButton.textContent = 'Search';
  searchButton.style.fontSize = '18px';
  searchButton.style.padding = '10px 20px';
  searchButton.style.position = 'absolute';
  searchButton.style.right = '20px';
  searchButton.style.top = '20px';
  searchButton.addEventListener('click', () => {
    if (selectedText.trim() !== '') {
      searchGoogle(selectedText.trim());
      selectedText = '';
      updateSelectedText();
    }
  });
  document.body.appendChild(searchButton);
}

function createButtons() {
  const buttonContainer = document.createElement('div');
  buttonContainer.style.position = 'absolute';
  buttonContainer.style.right = '20px';
  buttonContainer.style.top = '20px';
  buttonContainer.style.display = 'flex';
  buttonContainer.style.flexDirection = 'column';
  buttonContainer.style.gap = '10px'; // This adds space between buttons

  const buttonNames = ['Search', 'Space', 'Speak', 'Send', 'Delete'];

  buttonNames.forEach(name => {
    const button = document.createElement('button');
    button.textContent = name;
    button.style.fontSize = '18px';
    button.style.padding = '10px 20px';
    button.style.width = '120px'; // Set a fixed width for all buttons
    button.addEventListener('click', () => {
      activateToolbarOption(name);
    });
    buttonContainer.appendChild(button);
  });

  document.body.appendChild(buttonContainer);
}

// Add or modify this function to perform the Google search
function searchGoogle(query) {
  if (query.trim() === '') {
    console.log("Empty query, not performing search");
    return;
  }
  
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  window.open(searchUrl, '_blank');
  console.log(`Searching Google for: ${query}`);
}

// Modify the activateVirtualButton function
function activateVirtualButton(button) {
  if (button === 'Search') {
    if (selectedText.trim() !== '') {
      searchGoogle(selectedText.trim());
      console.log(`Searching for: ${selectedText.trim()}`);
      selectedText = ''; // Clear the selected text after searching
      updateSelectedText();
    } else {
      console.log("No text to search");
    }
  } else if (button === 'Space') {
    addSpace();
  }
  currentVirtualButtonIndex = -1; // Reset virtual button selection after activation
}

// Add this new function to handle toolbar option activation
function activateToolbarOption(option) {
  switch(option) {
    case 'Search':
      if (selectedText.trim() !== '') {
        searchGoogle(selectedText.trim());
        selectedText = '';
        updateSelectedText();
      }
      break;
    case 'Space':
      addSpace();
      break;
    case 'Speak':
      if (selectedText.trim() !== '') {
        speakText(selectedText.trim());
      }
      break;
    case 'Send':
      if (selectedText.trim() !== '') {
        sendText(selectedText.trim());
      }
      break;
    case 'Delete':
      deleteLastCharacter();
      break;
  }
}

// Add this function to switch modes
function switchMode() {
  currentMode = currentMode === KEYBOARD_MODE ? TOOLBAR_MODE : KEYBOARD_MODE;
  console.log(`Switched to ${currentMode} mode`);
}

function speakText(text) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(utterance);
    console.log(`Speaking: ${text}`);
  } else {
    console.log("Text-to-speech not supported in this browser.");
  }
}

function speakLetter(letter) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(letter);
    utterance.rate = 1.5; // Slightly faster rate for single letters
    utterance.pitch = 1.2; // Slightly higher pitch to distinguish from full text
    speechSynthesis.cancel(); // Cancel any ongoing speech
    speechSynthesis.speak(utterance);
  } else {
    console.log("Text-to-speech not supported in this browser.");
  }
}

function sendText(text) {
  const recipient = 'shriya.ned@gmail.com';
  const subject = 'Message from Eye-Tracking Interface';
  const body = encodeURIComponent(text);
  
  const gmailComposeURL = `https://mail.google.com/mail/?view=cm&fs=1&to=${recipient}&su=${subject}&body=${body}`;
  
  window.open(gmailComposeURL, '_blank');
  
  console.log(`Opening Gmail compose window with text: ${text}`);
  selectedText = ''; // Clear the selected text after sending
  updateSelectedText();
}

function deleteLastCharacter() {
  if (selectedText.length > 0) {
    selectedText = selectedText.slice(0, -1);
    updateSelectedText();
    console.log(`Deleted last character. New text: ${selectedText}`);
    // Optionally, speak the new last character or "deleted" if text is now empty
    if (selectedText.length > 0) {
      speakLetter(selectedText[selectedText.length - 1]);
    } else {
      speakLetter("deleted");
    }
  } else {
    console.log("No text to delete");
    speakLetter("empty");
  }
}

let selectedVoice = null;

function setUpVoice() {
  const urlParams = new URLSearchParams(window.location.search);
  const selectedVoiceName = urlParams.get('voice');

  window.speechSynthesis.onvoiceschanged = () => {
    const voices = window.speechSynthesis.getVoices();
    if (selectedVoiceName) {
      selectedVoice = voices.find(voice => voice.name === selectedVoiceName);
    }
    if (!selectedVoice) {
      // Fallback to first English voice or any voice if no English voice is found
      selectedVoice = voices.find(voice => voice.lang.startsWith('en-')) || voices[0];
    }
    console.log(`Selected voice: ${selectedVoice.name}`);
  };
}
function createVoiceMenu() {
  const voiceSelect = document.createElement('select');
  voiceSelect.id = 'voice-select';
  voiceSelect.style.position = 'absolute';
  voiceSelect.style.left = '20px';
  voiceSelect.style.top = '20px';

  window.speechSynthesis.onvoiceschanged = () => {
    const voices = window.speechSynthesis.getVoices();
    voices.forEach((voice, i) => {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `${voice.name} (${voice.lang})`;
      voiceSelect.appendChild(option);
    });
  };

  voiceSelect.addEventListener('change', (event) => {
    const voices = window.speechSynthesis.getVoices();
    selectedVoice = voices[event.target.value];
    console.log(`Selected voice: ${selectedVoice.name}`);
  });

  document.body.appendChild(voiceSelect);
}







