import * as faceapi from 'face-api.js';

// Loads all required face-api.js models from /models
export async function loadFaceApiModels() {
  const MODEL_URL = '/models';
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
}

// Extracts a face descriptor from an image (HTMLImageElement, HTMLVideoElement, or HTMLCanvasElement)
export async function getFaceDescriptor(input) {
  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (detection && detection.descriptor) {
    return Array.from(detection.descriptor); // Store as array
  }
  return null;
}

// Compares two descriptors, returns true if match (distance < threshold)
export function compareFaceDescriptors(descriptor1, descriptor2, threshold = 0.5) {
  if (!descriptor1 || !descriptor2) return false;
  const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
  return distance < threshold;
}
