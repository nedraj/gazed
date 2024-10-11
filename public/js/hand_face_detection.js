/*
 * Copyright 2024 Forrest Moulin
 *
 * Portions of this code are based on MediaPipe code:
 * Copyright 2023 The MediaPipe Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * hand_face_detection.js
 */

  // Import required vision module from MediaPipe using CDN
  import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
  // Extract required classes from vision module
  const { FaceLandmarker, FilesetResolver, DrawingUtils, GestureRecognizer } = vision;

  let gestureNameMap = {};
  let faceLandmarker;
  let gestureRecognizer;
  let webcamRunning = false;
  let handGestureRunning = false;
  let delegateType = 'CPU';
  const video = document.getElementById("webcam");
  const canvasElement = document.getElementById("output_canvas");
  const canvasCtx = canvasElement.getContext("2d");
  const enableWebcamButton = document.getElementById("webcamButton");
  // const gestureButton = document.getElementById("gestureButton");
  const gestureOutput = document.getElementById("gesture_output");
  const confidenceOutput = document.getElementById("confidence_output");
  const handednessOutput = document.getElementById("handedness_output");
  const faceOutput = document.getElementById("face_output");
  const handCountOutput = document.getElementById("hand_count_output");

  // Add these constants near the top of the file
  const EYE_AR_THRESH = 3
  const EYE_AR_CONSEC_FRAMES = 3;
  const BLINK_SEQUENCE_FRAMES = 15;
  const GAZE_THRESHOLD = 3;
  const GAZE_DURATION = 2000; // 2 seconds in milliseconds
  const DOUBLE_BLINK_INTERVAL = 1000; // 1 second in milliseconds

  // Add these variables for blink and gaze detection
  let blinkCounter = 0;
  let lastBlinkTime = 0;
  let doubleBlink = false;
  let gazeStartTime = 0;
  let isGazing = false;

  // Add these variables for key selection
  let blinkCount = 0;
  let selectedKey = null;

  async function createFaceLandmarker() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: delegateType // "GPU" or "CPU"
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1
    });
  }

  async function createGestureRecognizer() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    gestureRecognizer = await GestureRecognizer.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
        delegate: delegateType //"GPU" pr CPU
      },
      runningMode: "VIDEO", 
      numHands: 2
    });
  }

  async function loadGestureNameMap() {
    try {
      const response = await fetch('/public/json/gesture_map.json');
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      gestureNameMap = await response.json();
      console.log("Gesture name map loaded successfully:", gestureNameMap);
      
    } catch (error) {
      console.error("Error loading gesture name map:", error);
    }
  }


  function sendGestureToServer(gesture) {
    fetch('/save-gesture', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ gesture: gesture })
    })
    .then(response => response.json())
    .then(data => {
        if (data.errors) {
            console.error('Validation errors:', data.errors);
        } else {
            console.log(data.message);
        }
    })
    .catch(error => console.error('Error:', error));
  }

  loadGestureNameMap();
  createFaceLandmarker();
  createGestureRecognizer();

  enableWebcamButton.addEventListener("click", enableCam);
  // gestureButton.addEventListener("click", toggleHandGestureDetection);

  function enableCam() {
    if (!faceLandmarker || !gestureRecognizer) {
      console.log("Wait! Models not loaded yet.");
      return;
    }

    webcamRunning = !webcamRunning;
    enableWebcamButton.innerText = webcamRunning ? "DISABLE FACE" : "DETECT FACE";
    // gestureButton.disabled = !webcamRunning;

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

  // function toggleHandGestureDetection() {
  //   handGestureRunning = !handGestureRunning;
  //   gestureButton.innerText = handGestureRunning ? "DISABLE HANDS" : "DETECT HANDS";
  // }

  function updateCanvasSize() {
    const videoRatio = video.videoHeight / video.videoWidth;
    video.style.width = '100%';
    video.style.height = 'auto';
    canvasElement.style.width = '100%';
    canvasElement.style.height = 'auto';
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
  }

  async function predictWebcam() {
    updateCanvasSize();

    if (webcamRunning) {
      const startTimeMs = performance.now();
      const faceResults = await faceLandmarker.detectForVideo(video, startTimeMs);

      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

      if (faceResults.faceLandmarks) {
        const drawingUtils = new DrawingUtils(canvasCtx);
        faceOutput.innerText = "Face landmarks detected.";
        for (const landmarks of faceResults.faceLandmarks) {
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

          // Add blink and gaze detection logic here
          const leftEye = [landmarks[33], landmarks[160], landmarks[158], landmarks[133], landmarks[153], landmarks[144]];
          const rightEye = [landmarks[362], landmarks[385], landmarks[387], landmarks[263], landmarks[373], landmarks[380]];
          const leftEAR = calculateEAR(leftEye);
          const rightEAR = calculateEAR(rightEye);
          const ear = (leftEAR + rightEAR) / 2.0;

          // Blink detection
          if (ear < EYE_AR_THRESH) {
            blinkCounter += 1;
          } else {
            if (blinkCounter >= EYE_AR_CONSEC_FRAMES) {
              const currentTime = Date.now();
              if (currentTime - lastBlinkTime < DOUBLE_BLINK_INTERVAL) {
                blinkCount++;
                if (blinkCount >= 2) { // Change to two blinks
                  console.log(`Two blinks detected on key: ${selectedKey}`);
                  document.getElementById('selectedKey').textContent = `Selected: ${selectedKey}`;
                  blinkCount = 0;
                  moveToNextKey(); // Move to the next key
                }
              } else {
                blinkCount = 1;
              }
              lastBlinkTime = currentTime;
            }
            blinkCounter = 0;
          }

          // Gaze detection
          const leftIris = landmarks[468];
          const rightIris = landmarks[473];
          const leftEyeCenter = calculateEyeCenter(leftEye);
          const rightEyeCenter = calculateEyeCenter(rightEye);
          const leftGaze = calculateGaze(leftIris, leftEyeCenter);
          const rightGaze = calculateGaze(rightIris, rightEyeCenter);
          const averageGaze = (leftGaze + rightGaze) / 2;

          if (averageGaze < GAZE_THRESHOLD) {
            if (gazeStartTime === 0) {
              gazeStartTime = Date.now();
            } else if (Date.now() - gazeStartTime > GAZE_DURATION) {
              const keys = document.querySelectorAll('.key');
              const focusedKey = document.activeElement;
              const currentIndex = Array.from(keys).indexOf(focusedKey);
              const nextIndex = (currentIndex + 1) % keys.length;
              keys[nextIndex].focus();
              gazeStartTime = 0;
            }
          } else {
            gazeStartTime = 0;
          }

          // Draw detection results
          canvasCtx.fillStyle = "white";
          canvasCtx.font = "20px Arial";
          canvasCtx.fillText(`EAR: ${ear.toFixed(2)}`, 10, 30);
          canvasCtx.fillText(`Blink: ${blinkCounter >= EYE_AR_CONSEC_FRAMES}`, 10, 60);
          canvasCtx.fillText(`Gaze: ${averageGaze.toFixed(2)}`, 10, 90);
          canvasCtx.fillText(`Selected Key: ${selectedKey}`, 10, 120);
        }
      } else {
        faceOutput.innerText = "No face landmarks detected.";
      }

      if (handGestureRunning) {
        const nowInMs = Date.now();
        const handResults = await gestureRecognizer.recognizeForVideo(video, nowInMs);

        canvasCtx.save();

        if (handResults.landmarks.length > 0) {
          const drawingUtils = new DrawingUtils(canvasCtx);
          let handIndex = 0;
          for (const landmarks of handResults.landmarks) {
            drawingUtils.drawConnectors(
              landmarks,
              GestureRecognizer.HAND_CONNECTIONS,
              { color: "#7696eb", lineWidth: 5 } // Landmark connection lines (default 00FF00)
            );
            // 21 landmark points
            drawingUtils.drawLandmarks(landmarks, { color: "#22dee5", lineWidth: 2 }); // #FF0000

            const gestures = handResults.gestures[handIndex];
            const handedness = handResults.handednesses[handIndex];
            if (gestures && gestures.length > 0) {
              const gestureName = gestures[0].categoryName;
              //gestureOutput.innerText = gesture_name_map[gestureName] || "Unknown Gesture";
              gestureOutput.innerText = gestureNameMap[gestureName] || "Unknown Gesture";
              //gestureOutput.innerText = `${gestures[0].categoryName}`;
              confidenceOutput.innerText = `${(gestures[0].score * 100).toFixed(2)}%`;
              handednessOutput.innerText = `${handedness[0].categoryName}`;
              sendGestureToServer(gestureName); // Send gesture to server
            } else {
              gestureOutput.innerText = "Not Detected";
              confidenceOutput.innerText = "100%";
              handednessOutput.innerText = "Not Detected";
            }
            handIndex++;
          }
        } else {
          gestureOutput.innerText = "Not Detected";
          confidenceOutput.innerText = "100%";
          handednessOutput.innerText = "Not Detected";
        }

        handCountOutput.innerText = `${handResults.landmarks.length}`;

        canvasCtx.restore();
      }

      window.requestAnimationFrame(predictWebcam);
    }
  }

  // Add these helper functions at the end of the file

  function calculateEyeCenter(eye) {
    const x = (eye[0].x + eye[3].x) / 2;
    const y = (eye[1].y + eye[5].y) / 2;
    return { x, y };
  }

  function calculateGaze(iris, eyeCenter) {
    return Math.sqrt(Math.pow(iris.x - eyeCenter.x, 2) + Math.pow(iris.y - eyeCenter.y, 2));
  }

  function calculateEAR(eye) {
    const verticalDist1 = dist(eye[1], eye[5]);
    const verticalDist2 = dist(eye[2], eye[4]);
    const horizontalDist = dist(eye[0], eye[3]);
    return (verticalDist1 + verticalDist2) / (2 * horizontalDist);
  }

  function dist(point1, point2) {
    return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));
  }

  // Function to move to the next key
  function moveToNextKey() {
    const keys = document.querySelectorAll('.key');
    const focusedKey = document.activeElement;
    const currentIndex = Array.from(keys).indexOf(focusedKey);
    const nextIndex = (currentIndex + 1) % keys.length;
    keys[nextIndex].focus();
  }

  // Update the initializeKeys function
  function initializeKeys() {
    const keys = document.querySelectorAll('.key');
    keys.forEach(key => {
      key.addEventListener('focus', () => {
        selectedKey = key.textContent;
      });
    });

    // Set default focus on the key 'H'
    document.getElementById('key-h').focus();
  }

  // Call this function after the DOM is loaded
  document.addEventListener('DOMContentLoaded', initializeKeys);