// Loads all required face-api.js models from /models
export async function loadFaceApiModels() {
  const MODEL_URL = '/models';
  
  // Check if face-api is available globally
  if (typeof window.faceapi === 'undefined') {
    throw new Error('face-api.js not loaded. Please refresh the page.');
  }
  
  console.log('Loading models from:', MODEL_URL);
  
  await Promise.all([
    window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  
  console.log('All face-api models loaded successfully');
}

// Extracts a face descriptor from an image (HTMLImageElement, HTMLVideoElement, or HTMLCanvasElement)
export async function getFaceDescriptor(input) {
  if (typeof window.faceapi === 'undefined') {
    throw new Error('face-api.js not loaded. Please refresh the page.');
  }
  
  const detection = await window.faceapi
    .detectSingleFace(input, new window.faceapi.TinyFaceDetectorOptions())
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
  if (typeof window.faceapi === 'undefined') {
    throw new Error('face-api.js not loaded. Please refresh the page.');
  }
  const distance = window.faceapi.euclideanDistance(descriptor1, descriptor2);
  return distance < threshold;
}
