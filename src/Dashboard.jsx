import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';
import { db } from './firebase';
import { collection, addDoc, Timestamp, query, where, getDocs, orderBy, limit, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { loadFaceApiModels, getFaceDescriptor, compareFaceDescriptors } from './faceApiUtils';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes countdown
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [attendanceType, setAttendanceType] = useState(''); // 'checkin' or 'checkout'
  const [serverTime, setServerTime] = useState(null);
  const [attendanceStatus, setAttendanceStatus] = useState('');
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [popupType, setPopupType] = useState(''); // 'success', 'error', 'warning'
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const serverTimeFetchedRef = useRef(false);
  let stream = useRef(null);
  const [livenessChecked, setLivenessChecked] = useState(false);
  const [livenessError, setLivenessError] = useState('');
  const [livenessProgress, setLivenessProgress] = useState(0); // Add progress tracking
  const [showConfirmation, setShowConfirmation] = useState(false); // Add confirmation dialog
  const [pendingAttendanceType, setPendingAttendanceType] = useState(''); // Store pending attendance type
  const [showSuccessScreen, setShowSuccessScreen] = useState(false); // Add success screen
  const [successMessage, setSuccessMessage] = useState(''); // Store success message
  const [showLeaveModal, setShowLeaveModal] = useState(false); // Add leave application modal
  const [leaveDate, setLeaveDate] = useState(''); // Leave date
  const [leaveReason, setLeaveReason] = useState(''); // Leave reason
  const [leaveType, setLeaveType] = useState('sick'); // Leave type
  const [approvedLeaves, setApprovedLeaves] = useState([]); // Approved leave dates
  const navigate = useNavigate();

  useEffect(() => {
    // Get user data from localStorage
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      const userData = JSON.parse(currentUser);
      setUser(userData);
      
      // Check if user is admin and redirect to admin panel
      console.log('Dashboard - User data:', userData);
      console.log('Dashboard - User role:', userData.role);
      console.log('Dashboard - Role comparison (case-insensitive):', userData.role?.toLowerCase() === 'admin');
      console.log('Dashboard - Face descriptor exists:', !!userData.faceDescriptor);
      console.log('Dashboard - Face descriptor type:', typeof userData.faceDescriptor);
      console.log('Dashboard - Face descriptor length:', userData.faceDescriptor ? userData.faceDescriptor.length : 'N/A');
      
      if (userData.role?.toLowerCase() === 'admin') {
        console.log('Dashboard - Redirecting admin to admin panel...');
        navigate('/admin');
        return;
      }
    }
    setLoading(false);
    
    // Get server time from third-party API
    fetchServerTime();
    
    // Load approved leaves for this user
    loadApprovedLeaves();
  }, [navigate]);

  // Reload leaves when user data is available
  useEffect(() => {
    if (user?.empId) {
      loadApprovedLeaves();
    }
  }, [user?.empId]);

  const loadApprovedLeaves = async () => {
    if (!user?.empId) {
      console.log('User empId not available yet, skipping leave loading');
      return;
    }
    
    try {
      console.log('Loading approved leaves for empId:', user.empId);
      const attendanceRef = collection(db, 'attendance');
      const q = query(
        attendanceRef,
        where('empId', '==', user.empId),
        where('type', '==', 'leave'),
        where('status', '==', 'approved_leave')
      );
      
      const querySnapshot = await getDocs(q);
      const leaves = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log('Loaded approved leaves:', leaves);
      setApprovedLeaves(leaves);
    } catch (error) {
      console.error('Error loading approved leaves:', error);
    }
  };

  const isLeaveDay = (date) => {
    const dateString = date instanceof Date ? date.toISOString().split('T')[0] : date;
    const hasLeave = approvedLeaves.some(leave => leave.date === dateString);
    console.log(`Checking leave for date ${dateString}:`, hasLeave, 'Available leaves:', approvedLeaves.map(l => l.date));
    return hasLeave;
  };

  const fetchServerTime = async (retryCount = 0) => {
    const maxRetries = 3;
    
    // Prevent multiple simultaneous calls
    if (serverTimeFetchedRef.current || serverTime) {
      console.log('Server time already fetched, skipping');
      return;
    }
    
    serverTimeFetchedRef.current = true;
    
    try {
      console.log(`Attempting to fetch server time from multiple sources... (attempt ${retryCount + 1})`);
      
      // Try multiple time APIs for better reliability
      const timeAPIs = [
        'https://worldtimeapi.org/api/timezone/Asia/Karachi',
        'https://timeapi.io/api/Time/current/zone?timeZone=Asia/Karachi',
        'https://api.timezonedb.com/v2.1/get-time-zone?key=demo&format=json&by=zone&zone=Asia/Karachi'
      ];
      
      let serverTimeData = null;
      let apiUsed = '';
      
      // Try each API until one succeeds
      for (const api of timeAPIs) {
        try {
          console.log(`Trying API: ${api}`);
          const response = await fetch(api, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(3000) // 3 second timeout per API
          });
          
          if (response.ok) {
            const data = await response.json();
            // Parse different API response formats
            if (data.datetime) {
              serverTimeData = new Date(data.datetime);
              apiUsed = 'worldtimeapi';
            } else if (data.dateTime) {
              serverTimeData = new Date(data.dateTime);
              apiUsed = 'timeapi';
            } else if (data.formatted) {
              serverTimeData = new Date(data.formatted);
              apiUsed = 'timezonedb';
            }
            
            if (serverTimeData && !isNaN(serverTimeData.getTime())) {
              console.log(`Server time fetched successfully from ${apiUsed}:`, serverTimeData.toISOString());
              break;
            }
          }
        } catch (apiError) {
          console.log(`API ${api} failed:`, apiError.message);
          continue;
        }
      }
      
      if (serverTimeData) {
        setServerTime(serverTimeData);
        return;
      }
      
      throw new Error('All time APIs failed');
      
    } catch (error) {
      console.warn(`Failed to fetch server time from all APIs (attempt ${retryCount + 1}):`, error.message);
      
      // Retry if we haven't exceeded max retries
      if (retryCount < maxRetries) {
        console.log(`Retrying in 3 seconds... (${retryCount + 1}/${maxRetries})`);
        setTimeout(() => {
          fetchServerTime(retryCount + 1);
        }, 3000);
      } else {
        console.log('Max retries reached, using secure fallback');
        // Use Firebase server timestamp as fallback (more secure than local time)
        setServerTime(new Date()); // This will be replaced by Firebase timestamp in processAttendance
        console.log('Using Firebase server timestamp as fallback');
      }
    }
  };

  // Auto-logout after 1 minute of inactivity
  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      // Clear existing timers
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      
      // Reset countdown
      setTimeLeft(300);
      
      // Start countdown interval
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      // Set auto-logout timeout
      timeoutRef.current = setTimeout(() => {
        handleLogout();
      }, 300000); // 5 minutes (300 seconds)
    };

    // Activity event listeners
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetTimer();
    };

    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Start initial timer
    resetTimer();

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    navigate('/');
  };

  // Helper for EAR (eye aspect ratio)
  function getEAR(landmarks, left=true) {
    // 36-41: left eye, 42-47: right eye
    const idx = left ? 36 : 42;
    const p = landmarks.slice(idx, idx+6);
    const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);
    return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2.0 * dist(p[0], p[3]));
  }



  // Liveness check: blink detection using face detection failure
  const runLivenessCheck = async () => {
    console.log('Starting liveness check...');
    setLivenessError('');
    setLivenessProgress(0); // Reset progress
    
    try {
      console.log('Loading face-api models...');
      await loadFaceApiModels();
      console.log('Face-api models loaded successfully');
      
      if (!videoRef.current) {
        setLivenessError('Video not available. Please try again.');
        return;
      }
      
      const video = videoRef.current;
      console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);
      
      if (!video.videoWidth || !video.videoHeight) {
        setLivenessError('Video not ready. Please wait a moment and try again.');
        return;
      }
      
      // Check if face-api is available
      if (typeof window.faceapi === 'undefined') {
        setLivenessError('Face detection library not loaded. Please refresh the page.');
        return;
      }
      
      const frames = [];
      // Capture frames for 1.5 seconds (every 50ms for faster detection)
      for (let i = 0; i < 30; i++) {
        await new Promise(res => setTimeout(res, 50));
        setLivenessProgress((i + 1) * 3.33); // Update progress (0-100%)
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        frames.push(canvas);
      }
      
      console.log('Captured', frames.length, 'frames for analysis');
      
      // Analyze frames for face detection failures (indicates blink)
      let faceDetectedCount = 0;
      let faceNotDetectedCount = 0;
      let blinked = false;
      let lastState = 'detected';
      let confidenceValues = []; // Track detection confidence
      
      for (let i = 0; i < frames.length; i++) {
        try {
          const frame = frames[i];
          console.log(`Analyzing frame ${i + 1}/${frames.length}...`);
          
          const detection = await window.faceapi
            .detectSingleFace(frame, new window.faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();
            
          if (!detection || !detection.landmarks) {
            console.log(`Frame ${i + 1} - NO FACE DETECTED (possible blink)`);
            faceNotDetectedCount++;
            confidenceValues.push(0); // No confidence when no face detected
            if (lastState === 'detected') blinked = true;
            lastState = 'not_detected';
          } else {
            console.log(`Frame ${i + 1} - Face detected, confidence: ${detection.detection.score}`);
            faceDetectedCount++;
            confidenceValues.push(detection.detection.score || 1.0); // Track confidence score
            lastState = 'detected';
          }
        } catch (error) {
          console.error(`Error analyzing frame ${i + 1}:`, error);
          faceNotDetectedCount++;
        }
      }
      
      console.log('Analysis complete:');
      console.log('- Frames with face detected:', faceDetectedCount);
      console.log('- Frames with NO face detected:', faceNotDetectedCount);
      console.log('- Blinked:', blinked);
      console.log('- Confidence values:', confidenceValues);
      
      // Check for confidence drops (indicates blink)
      let confidenceDrops = 0;
      for (let i = 1; i < confidenceValues.length; i++) {
        if (confidenceValues[i] < confidenceValues[i-1] * 0.9) { // 10% drop in confidence (more sensitive)
          confidenceDrops++;
        }
      }
      console.log('- Confidence drops:', confidenceDrops);
      
      // Blink detected if we have both detected and not detected frames OR significant confidence drops
      if ((blinked && faceDetectedCount > 3 && faceNotDetectedCount > 0) || confidenceDrops > 1) {
        setLivenessChecked(true);
        setLivenessError('');
        setLivenessProgress(100); // Complete progress
        console.log('Liveness check PASSED - blink detected via face detection failure!');
        
        // Show success message immediately
        showPopupMessage('Liveness check passed! Capturing photo...', 'success');
        
        // Automatically capture photo after successful liveness check
        setTimeout(() => {
          capturePhoto();
        }, 1000); // Wait 1 second for user to see success message
      } else {
        setLivenessChecked(false);
        setLivenessError('No blink detected. Please blink clearly and try again.');
        setLivenessProgress(0); // Reset progress
        console.log('Liveness check FAILED - no blink detected');
      }
    } catch (error) {
      console.error('Liveness check error:', error);
      setLivenessChecked(false);
      setLivenessError('Error during liveness check. Please try again.');
      setLivenessProgress(0); // Reset progress on error
    }
  };

  const openCamera = async (type) => {
    setPendingAttendanceType(type);
    setShowConfirmation(true);
  };

  const confirmAttendance = async () => {
    const type = pendingAttendanceType;
    
    setShowConfirmation(false);
    setAttendanceType(type);
    setCameraError('');
    setShowCamera(true);
    setLivenessChecked(false);
    setLivenessError('');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream.current;
        videoRef.current.play();
      }
    } catch (err) {
      setCameraError('Unable to access camera. Please allow camera access.');
      setShowCamera(false);
    }
  };

  const capturePhoto = async () => {
    console.log('capturePhoto called');
    console.log('videoRef.current:', videoRef.current);
    console.log('canvasRef.current:', canvasRef.current);
    
    if (!videoRef.current) {
      showPopupMessage('Video not available. Please try again.', 'error');
      return;
    }
    
    // Show progress message
    showPopupMessage('Processing photo and getting location...', 'warning');
    
    // Create a temporary canvas if the ref is null
    let canvas = canvasRef.current;
    if (!canvas) {
      console.log('Canvas ref is null, creating temporary canvas');
      canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
    }
    
    try {
      const context = canvas.getContext('2d');
      if (!context) {
        showPopupMessage('Canvas context not available. Please try again.', 'error');
        return;
      }
      
      // Set canvas dimensions to match video
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      
      // Draw video frame to canvas
      context.drawImage(videoRef.current, 0, 0);
      
      // Stop the camera
      if (stream.current) {
        stream.current.getTracks().forEach((track) => track.stop());
      }
      setShowCamera(false);
      
      // Get current location with same settings as registration
      let currentLocation = null;
      if (navigator.geolocation) {
        try {
          // Try multiple times to get accurate location
          let attempts = 0;
          const maxAttempts = 3;
          
          while (attempts < maxAttempts) {
            const position = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000, // Increased timeout
                maximumAge: 0
              });
            });
            
            console.log(`Attempt ${attempts + 1} - Raw GPS:`, position.coords.latitude, position.coords.longitude);
            console.log(`Attempt ${attempts + 1} - Accuracy:`, position.coords.accuracy, 'meters');
            
            // Only accept if accuracy is good (less than 50 meters)
            if (position.coords.accuracy <= 100) {
              currentLocation = {
                lat: Math.round(position.coords.latitude * 1000000) / 1000000,
                lng: Math.round(position.coords.longitude * 1000000) / 1000000,
              };
              break;
            } else {
              console.log(`Accuracy too poor (${position.coords.accuracy}m), trying again...`);
              attempts++;
              if (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
              }
            }
          }
          
          if (!currentLocation) {
            showPopupMessage('Unable to get accurate location. Please try again.', 'error');
            return;
          }
          
          console.log('Final coordinates:', currentLocation.lat, currentLocation.lng);
        } catch (err) {
          console.error('Location error:', err);
          showPopupMessage('Location access denied. Cannot proceed.', 'error');
          return;
        }
      }
      
      // Verify location (allow 500m radius difference for store movement)
      if (user.location && currentLocation) {
        const distance = calculateDistance(
          user.location.lat, user.location.lng,
          currentLocation.lat, currentLocation.lng
        );
        console.log('Registered location:', user.location);
        console.log('Current location:', currentLocation);
        console.log('Distance from registered location:', distance, 'meters');
        
        // For debugging - show exact coordinates
        console.log(`Registered: ${user.location.lat}, ${user.location.lng}`);
        console.log(`Current: ${currentLocation.lat}, ${currentLocation.lng}`);
        
        if (distance > 100) { // Reduced to 100 meters for strict location matching
          showPopupMessage(`Location mismatch. You are ${Math.round(distance)}m away from your registered location. Please be at your exact registered location.`, 'error');
          return;
        }
      } else {
        console.log('Location verification skipped - missing data');
        console.log('User location:', user.location);
        console.log('Current location:', currentLocation);
      }
      
      // --- FACE RECOGNITION ---
      console.log('Starting face recognition...');
      showPopupMessage('Verifying face identity...', 'warning');
      
      try {
        await loadFaceApiModels();
        console.log('Face models loaded for verification');
      } catch (error) {
        console.error('Error loading face models:', error);
        showPopupMessage('Error loading face recognition models. Please refresh the page.', 'error');
        return;
      }
      
      const img = new Image();
      img.src = canvas.toDataURL('image/jpeg');
      await new Promise((resolve) => { img.onload = resolve; });
      console.log('Image loaded, getting face descriptor...');
      
      const capturedDescriptor = await getFaceDescriptor(img);
      console.log('Face descriptor result:', capturedDescriptor ? 'Success' : 'Failed');
      console.log('Captured descriptor type:', typeof capturedDescriptor);
      console.log('Captured descriptor length:', capturedDescriptor ? capturedDescriptor.length : 'N/A');
      console.log('Captured descriptor sample:', capturedDescriptor ? capturedDescriptor.slice(0, 5) : 'N/A');
      
      // Multi-factor verification: Check face detection confidence
      const faceDetection = await window.faceapi
        .detectSingleFace(img, new window.faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();
      
      const detectionConfidence = faceDetection.detection.score;
      console.log('Face detection confidence:', detectionConfidence);
      
      // Additional security: Require high detection confidence
      if (detectionConfidence < 0.8) {
        showPopupMessage('Face detection confidence too low. Please try again.', 'error');
        console.log('SECURITY ALERT: Low face detection confidence for user:', user.empId, 'Confidence:', detectionConfidence);
        return;
      }
      
      if (!capturedDescriptor) {
        showPopupMessage('No face detected or face not clear. Please try again.', 'error');
        console.log('SECURITY ALERT: No face detected during attendance attempt');
        return;
      }
      if (!user.faceDescriptor) {
        showPopupMessage('No reference face found. Please contact admin.', 'error');
        console.log('SECURITY ALERT: No reference face found for user:', user.empId);
        console.log('User data from localStorage:', user);
        console.log('Face descriptor type:', typeof user.faceDescriptor);
        console.log('Face descriptor value:', user.faceDescriptor);
        return;
      }
      const isFaceMatch = compareFaceDescriptors(capturedDescriptor, user.faceDescriptor);
      console.log('Face match result:', isFaceMatch);
      
      // Enhanced face verification with confidence score
      const faceDistance = window.faceapi.euclideanDistance(capturedDescriptor, user.faceDescriptor);
      console.log('Face distance:', faceDistance);
      
      // More strict threshold for security (0.4 instead of 0.5)
      const strictThreshold = 0.4;
      const isStrictMatch = faceDistance < strictThreshold;
      
      // Additional security: Check for suspiciously perfect matches (possible spoofing)
      const suspiciouslyPerfect = faceDistance < 0.05; // Too perfect might be a photo
      console.log('Suspiciously perfect match:', suspiciouslyPerfect);
      
      if (!isFaceMatch) {
        showPopupMessage('Face verification failed. Please try again.', 'error');
        console.log('SECURITY ALERT: Face verification failed for user:', user.empId, 'Distance:', faceDistance);
        return;
      }
      
      // Additional security check with stricter threshold
      if (!isStrictMatch) {
        showPopupMessage('Face verification failed - possible identity mismatch. Please try again.', 'error');
        console.log('SECURITY ALERT: Strict face verification failed for user:', user.empId, 'Distance:', faceDistance);
        return;
      }
      
      // Check for suspiciously perfect matches (possible photo spoofing)
      if (suspiciouslyPerfect) {
        showPopupMessage('Suspicious verification result. Please try again with better lighting.', 'error');
        console.log('SECURITY ALERT: Suspiciously perfect match detected for user:', user.empId, 'Distance:', faceDistance);
        return;
      }
      
      // Show success message for face verification
      showPopupMessage('Face verified! Recording attendance...', 'success');
      console.log('SECURITY SUCCESS: Face verification passed for user:', user.empId, 'Distance:', faceDistance);
      
      // Process attendance
      await processAttendance(attendanceType, currentLocation);
    } catch (error) {
      console.error('Error in capturePhoto:', error);
      showPopupMessage('Failed to capture photo. Please try again.', 'error');
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  };

  const displaySuccessScreen = (message) => {
    setSuccessMessage(message);
    setShowSuccessScreen(true);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setShowSuccessScreen(false);
    }, 3000);
  };

  const submitLeaveApplication = async () => {
    if (!leaveDate || !leaveReason.trim()) {
      showPopupMessage('Please fill in all required fields.', 'error');
      return;
    }

    // Check if date is in the past
    const selectedDate = new Date(leaveDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      showPopupMessage('Cannot apply for leave on past dates.', 'error');
      return;
    }

    try {
      const leaveApplication = {
        empId: user.empId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        branch: user.branch,
        role: user.role,
        leaveDate: leaveDate,
        leaveType: leaveType,
        reason: leaveReason.trim(),
        status: 'pending',
        appliedAt: Timestamp.now(),
        appliedDate: new Date().toISOString().split('T')[0]
      };

      await addDoc(collection(db, 'leaveApplications'), leaveApplication);
      
      showPopupMessage('Leave application submitted successfully! Admin will review your request.', 'success');
      setShowLeaveModal(false);
      setLeaveDate('');
      setLeaveReason('');
      setLeaveType('sick');
      
      // Refresh approved leaves in case this affects today
      loadApprovedLeaves();
    } catch (error) {
      console.error('Error submitting leave application:', error);
      showPopupMessage('Failed to submit leave application. Please try again.', 'error');
    }
  };

  const showPopupMessage = (message, type) => {
    setPopupMessage(message);
    setPopupType(type);
    setShowPopup(true);
    setTimeout(() => {
      setShowPopup(false);
    }, 8000); // Auto-hide after 8 seconds (increased from 5)
  };

  const processAttendance = async (type, location) => {
    let currentTime;
    
    if (serverTime) {
      // Use verified server time
      currentTime = serverTime;
      console.log('Using verified server time:', currentTime.toISOString());
    } else {
      // Use Firebase server timestamp as secure fallback
      console.log('Using Firebase server timestamp as secure fallback');
      try {
        // Create a temporary document to get Firebase server timestamp
        const tempRef = await addDoc(collection(db, 'temp_timestamps'), {
          temp: true
        });
        
        // Get the document to read the server timestamp
        const tempDoc = await getDoc(tempRef);
        const serverTimestamp = tempDoc.data().timestamp;
        
        // Convert Firebase timestamp to Date
        currentTime = serverTimestamp.toDate();
        
        // Clean up temporary document
        await deleteDoc(tempRef);
        
        console.log('Firebase server timestamp obtained:', currentTime.toISOString());
      } catch (error) {
        console.error('Failed to get Firebase server timestamp:', error);
        // Last resort: use local time but log security warning
        currentTime = new Date();
        console.warn('SECURITY WARNING: Using local time as last resort - may be tampered with');
      }
    }
    const today = currentTime.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Check if user already has attendance for today
    try {
      const todayAttendanceQuery = query(
        collection(db, 'attendance'),
        where('empId', '==', user.empId),
        where('date', '==', today),
        where('type', '==', type)
      );
      
      const todayAttendanceSnapshot = await getDocs(todayAttendanceQuery);
      
      if (!todayAttendanceSnapshot.empty) {
        if (type === 'checkin') {
          showPopupMessage('You have already checked in today! Only one check-in per day is allowed.', 'error');
        } else {
          showPopupMessage('You have already checked out today! Only one check-out per day is allowed.', 'error');
        }
        return;
      }
    } catch (error) {
      console.error('Error checking today\'s attendance:', error);
      showPopupMessage('Error checking attendance records. Please try again.', 'error');
      return;
    }

    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    let status = 'on_time';
    let message = '';
    let popupType = 'success';

    if (type === 'checkin') {
      // Check-in time: 11 AM Pakistan time
      const checkinTime = new Date(currentTime);
      checkinTime.setHours(11, 0, 0, 0);
      
      if (currentTime > checkinTime) {
        status = 'late';
        message = `You are LATE! Check-in time was 11:00 AM. Current time: ${currentTime.toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' })}`;
        popupType = 'warning';
      } else {
        message = `Check-in SUCCESSFUL! You are ON TIME. Current time: ${currentTime.toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' })}`;
        popupType = 'success';
      }
    } else if (type === 'checkout') {
      // Check-out time: 10 PM Pakistan time
      const checkoutTime = new Date(currentTime);
      checkoutTime.setHours(22, 0, 0, 0);
      
      if (currentTime < checkoutTime) {
        status = 'early';
        message = `You are leaving EARLY! Check-out time is 10:00 PM. Current time: ${currentTime.toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' })}`;
        popupType = 'warning';
      } else {
        message = `Check-out SUCCESSFUL! You are ON TIME. Current time: ${currentTime.toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' })}`;
        popupType = 'success';
      }
    }

    try {
      // Additional security: Check for suspicious time differences
      const localTime = new Date();
      const timeDifference = Math.abs(currentTime.getTime() - localTime.getTime());
      const maxAllowedDifference = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      if (timeDifference > maxAllowedDifference) {
        console.warn(`SECURITY ALERT: Large time difference detected - Server: ${currentTime.toISOString()}, Local: ${localTime.toISOString()}, Difference: ${Math.round(timeDifference / 1000)}s`);
        // Log this as a potential security issue but don't block attendance
      }
      
      // Create attendance record
      const attendanceRecord = {
        type: type,
        timestamp: Timestamp.now(),
        serverTime: currentTime.toISOString(),
        localTime: localTime.toISOString(), // Store local time for comparison
        timeDifference: timeDifference, // Store the difference for analysis
        status: status,
        location: location,
        date: currentTime.toISOString().split('T')[0] // YYYY-MM-DD format
      };

      console.log('Saving attendance record:', attendanceRecord);
      console.log('User empId:', user.empId);

      // Save to attendance collection
      const attendanceDocRef = await addDoc(collection(db, 'attendance'), {
        empId: user.empId,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        ...attendanceRecord,
        branch: user.branch,
        role: user.role
      });
      console.log('Attendance record saved with ID:', attendanceDocRef.id);

      // Update empdata collection
      const empDataQuery = query(collection(db, 'empdata'), where('empId', '==', user.empId));
      const empDataSnapshot = await getDocs(empDataQuery);
      
      if (!empDataSnapshot.empty) {
        const empDataDoc = empDataSnapshot.docs[0];
        const empData = empDataDoc.data();
        
        // Update counters
        const updates = {
          attendanceRecords: [...empData.attendanceRecords, attendanceRecord]
        };
        
        if (type === 'checkin') {
          updates.totalCheckIns = (empData.totalCheckIns || 0) + 1;
          if (status === 'late') {
            updates.totalLateCheckIns = (empData.totalLateCheckIns || 0) + 1;
          }
        } else if (type === 'checkout') {
          updates.totalCheckOuts = (empData.totalCheckOuts || 0) + 1;
          if (status === 'early') {
            updates.totalEarlyCheckOuts = (empData.totalEarlyCheckOuts || 0) + 1;
          }
        }
        
        // Update the document
        await updateDoc(empDataDoc.ref, updates);
      }

      showPopupMessage(message, popupType);
      displaySuccessScreen(message); // Show full-screen success
    } catch (error) {
      showPopupMessage('Failed to record attendance. Please try again.', 'error');
      console.error('Attendance error:', error);
    }
  };

  if (loading) {
    return (
      <div className="landing-container">
        <div className="landing-header">
          <h1>Loading...</h1>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="landing-container">
        <div className="landing-header">
          <h1>Access Denied</h1>
          <p className="landing-description">Please login to access your dashboard.</p>
          <button className="landing-btn" onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-container">
      <div className="landing-header">
        <h1>Welcome, {user.name}!</h1>
        <p className="landing-description">Your attendance system dashboard</p>
        {isLeaveDay(new Date().toISOString().split('T')[0]) && (
          <div style={{ 
            color: '#4caf50', 
            fontSize: '1em', 
            marginTop: '0.5rem',
            fontWeight: 'bold',
            backgroundColor: 'rgba(76, 175, 80, 0.2)',
            padding: '0.5rem',
            borderRadius: '8px',
            border: '1px solid #4caf50'
          }}>
            🏠 You are on approved leave today
          </div>
        )}
        <div style={{ 
          color: timeLeft <= 10 ? '#ff6b6b' : '#61dafb', 
          fontSize: '0.9em', 
          marginTop: '0.5rem',
          fontWeight: '500'
        }}>
          Auto-logout in: {timeLeft}s
        </div>
      </div>
      
      <div className="auth-form" style={{ maxWidth: '500px', margin: '0 auto', padding: '1rem' }}>
        <div style={{ 
          background: 'rgba(255,255,255,0.1)', 
          padding: '1.5rem', 
          borderRadius: '12px',
          marginBottom: '1rem'
        }}>
          <h3 style={{ color: '#61dafb', marginBottom: '1rem', textAlign: 'center' }}>Profile Details</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ color: '#e0e7ff' }}>Name:</strong>
            <span style={{ color: '#fff', marginLeft: '8px' }}>{user.name}</span>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ color: '#e0e7ff' }}>Email:</strong>
            <span style={{ color: '#fff', marginLeft: '8px' }}>{user.email}</span>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ color: '#e0e7ff' }}>Phone:</strong>
            <span style={{ color: '#fff', marginLeft: '8px' }}>{user.phone}</span>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ color: '#e0e7ff' }}>Branch:</strong>
            <span style={{ color: '#fff', marginLeft: '8px' }}>{user.branch}</span>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ color: '#e0e7ff' }}>Role:</strong>
            <span style={{ color: '#fff', marginLeft: '8px', textTransform: 'capitalize' }}>{user.role}</span>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ color: '#e0e7ff' }}>Registered:</strong>
            <span style={{ color: '#fff', marginLeft: '8px' }}>
              {user.registeredAt ? new Date(user.registeredAt.seconds * 1000).toLocaleDateString() : 'N/A'}
            </span>
          </div>
          
          {user.imageUrl && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <img 
                src={user.imageUrl} 
                alt="Profile" 
                style={{ 
                  width: '120px', 
                  height: '120px', 
                  borderRadius: '50%', 
                  objectFit: 'cover',
                  border: '3px solid #61dafb',
                  boxShadow: '0 0 16px #61dafb55'
                }} 
              />
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button 
            className="landing-btn" 
            onClick={() => openCamera('checkin')} 
            disabled={isLeaveDay(new Date().toISOString().split('T')[0])}
            style={{ 
              minWidth: '140px', 
              minHeight: '50px', 
              fontSize: '1.1rem',
              padding: '1rem 1.5rem',
              opacity: isLeaveDay(new Date().toISOString().split('T')[0]) ? 0.5 : 1,
              cursor: isLeaveDay(new Date().toISOString().split('T')[0]) ? 'not-allowed' : 'pointer'
            }}
          >
            📱 Check In
          </button>
          <button 
            className="landing-btn" 
            onClick={() => openCamera('checkout')} 
            disabled={isLeaveDay(new Date().toISOString().split('T')[0])}
            style={{ 
              minWidth: '140px', 
              minHeight: '50px', 
              fontSize: '1.1rem',
              padding: '1rem 1.5rem',
              opacity: isLeaveDay(new Date().toISOString().split('T')[0]) ? 0.5 : 1,
              cursor: isLeaveDay(new Date().toISOString().split('T')[0]) ? 'not-allowed' : 'pointer'
            }}
          >
            📱 Check Out
          </button>
          <button className="landing-btn" onClick={() => setShowLeaveModal(true)} style={{ 
            minWidth: '140px', 
            minHeight: '50px', 
            fontSize: '1.1rem',
            padding: '1rem 1.5rem',
            backgroundColor: '#ffa726'
          }}>
            🏠 Apply for Leave
          </button>
        </div>
        
        {/* Leave Day Notice */}
        {isLeaveDay(new Date().toISOString().split('T')[0]) && (
          <div style={{
            background: 'rgba(76, 175, 80, 0.2)',
            border: '2px solid #4caf50',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            <div style={{ color: '#4caf50', fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              🏠 You are on approved leave today
            </div>
            <div style={{ color: '#e0e7ff', fontSize: '0.9rem' }}>
              Check In/Check Out buttons are disabled for leave days
            </div>
          </div>
        )}
        
        {showCamera && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1rem' }}>
            <video 
              ref={videoRef} 
              style={{ 
                width: '280px', 
                height: '280px', 
                borderRadius: '50%', 
                objectFit: 'cover', 
                background: '#222', 
                transform: 'scaleX(1)',
                maxWidth: '90vw',
                maxHeight: '90vw'
              }}
              autoPlay
              playsInline
            />
            <div style={{ fontSize: '12px', color: '#61dafb', marginTop: '4px', textAlign: 'center' }}>
              Camera shows real image (not mirrored)
            </div>
            <button className="landing-btn" onClick={runLivenessCheck} style={{
              marginTop: '1rem', 
              minWidth: '200px', 
              minHeight: '50px', 
              fontSize: '1rem',
              padding: '1rem 1.5rem'
            }} disabled={livenessChecked}>
              {livenessChecked ? '✅ Liveness Check Passed' : '👁️ Start Liveness Check (Blink)'}
            </button>
            {livenessProgress > 0 && livenessProgress < 100 && (
              <div style={{marginTop: '1rem', width: '100%', maxWidth: '300px'}}>
                <div style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#333',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${livenessProgress}%`,
                    height: '100%',
                    backgroundColor: '#61dafb',
                    transition: 'width 0.1s ease'
                  }} />
                </div>
                <div style={{marginTop: '4px', fontSize: '12px', color: '#61dafb'}}>
                  Analyzing... {Math.round(livenessProgress)}%
                </div>
              </div>
            )}
            {livenessError && <div style={{ color: '#ff6b6b', marginTop: 8 }}>{livenessError}</div>}
            <canvas 
              ref={canvasRef} 
              style={{ display: 'none' }}
              width="640"
              height="480"
            />
          </div>
        )}
        
        {cameraError && (
          <div style={{ color: '#ff6b6b', marginBottom: '1rem', textAlign: 'center' }}>
            {cameraError}
          </div>
        )}
        
        {/* Popup Modal */}
        {showPopup && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: popupType === 'success' ? 'linear-gradient(135deg, #61dafb 0%, #646cff 100%)' :
                         popupType === 'warning' ? 'linear-gradient(135deg, #ffa726 0%, #ff7043 100%)' :
                         'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)',
              padding: '2rem',
              borderRadius: '12px',
              maxWidth: '400px',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              border: '2px solid rgba(255,255,255,0.2)'
            }}>
              <h3 style={{ 
                color: '#fff', 
                marginBottom: '1rem',
                fontSize: '1.5rem',
                fontWeight: 'bold'
              }}>
                {popupType === 'success' ? '✅ SUCCESS' : 
                 popupType === 'warning' ? '⚠️ WARNING' : '❌ ERROR'}
              </h3>
              <p style={{ 
                color: '#fff', 
                fontSize: '1.1rem',
                lineHeight: '1.5',
                marginBottom: '1.5rem'
              }}>
                {popupMessage}
              </p>
              <button 
                className="landing-btn" 
                onClick={() => setShowPopup(false)}
                style={{ 
                  background: 'rgba(255,255,255,0.2)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.3)'
                }}
              >
                OK
              </button>
            </div>
          </div>
        )}
        
        {/* Confirmation Dialog */}
        {showConfirmation && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #61dafb 0%, #646cff 100%)',
              padding: '2rem',
              borderRadius: '12px',
              maxWidth: '400px',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              border: '2px solid rgba(255,255,255,0.2)'
            }}>
              <h3 style={{ 
                color: '#fff', 
                marginBottom: '1rem',
                fontSize: '1.5rem',
                fontWeight: 'bold'
              }}>
                🤔 Confirm Attendance
              </h3>
              <p style={{ 
                color: '#fff', 
                fontSize: '1.1rem',
                lineHeight: '1.5',
                marginBottom: '1.5rem'
              }}>
                Are you sure you want to <strong>{pendingAttendanceType === 'checkin' ? 'CHECK IN' : 'CHECK OUT'}</strong>?
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button 
                  className="landing-btn" 
                  onClick={() => setShowConfirmation(false)}
                  style={{ 
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)'
                  }}
                >
                  Cancel
                </button>
                <button 
                  className="landing-btn" 
                  onClick={confirmAttendance}
                  style={{ 
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)'
                  }}
                >
                  Yes, Proceed
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Leave Application Modal */}
        {showLeaveModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #61dafb 0%, #646cff 100%)',
              padding: '2rem',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              border: '2px solid rgba(255,255,255,0.2)'
            }}>
              <h3 style={{ 
                color: '#fff', 
                marginBottom: '1.5rem',
                fontSize: '1.5rem',
                fontWeight: 'bold'
              }}>
                🏠 Apply for Leave
              </h3>
              
              <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Leave Date *
                </label>
                <input
                  type="date"
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Leave Type
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                >
                  <option value="sick" style={{ color: '#000' }}>Sick Leave</option>
                  <option value="personal" style={{ color: '#000' }}>Personal Leave</option>
                  <option value="vacation" style={{ color: '#000' }}>Vacation</option>
                  <option value="emergency" style={{ color: '#000' }}>Emergency</option>
                  <option value="other" style={{ color: '#000' }}>Other</option>
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Reason *
                </label>
                <textarea
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Please provide a reason for your leave..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: '1rem',
                    minHeight: '80px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button 
                  className="landing-btn" 
                  onClick={() => setShowLeaveModal(false)}
                  style={{ 
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    minWidth: '120px'
                  }}
                >
                  Cancel
                </button>
                <button 
                  className="landing-btn" 
                  onClick={submitLeaveApplication}
                  style={{ 
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    minWidth: '120px'
                  }}
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Screen */}
        {showSuccessScreen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 255, 0, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            animation: 'fadeInOut 8s ease-in-out'
          }}>
            <div style={{
              textAlign: 'center',
              color: '#fff',
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
            }}>
              <div style={{
                fontSize: '4rem',
                marginBottom: '1rem',
                animation: 'bounce 1s ease-in-out'
              }}>
                ✅
              </div>
              <h1 style={{
                fontSize: '2.5rem',
                marginBottom: '1rem',
                fontWeight: 'bold'
              }}>
                SUCCESS!
              </h1>
              <p style={{
                fontSize: '1.2rem',
                maxWidth: '500px',
                lineHeight: '1.5'
              }}>
                {successMessage}
              </p>
            </div>
          </div>
        )}
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="landing-btn" onClick={() => navigate('/account')} style={{ 
            minWidth: '120px', 
            minHeight: '50px', 
            fontSize: '1rem',
            padding: '1rem 1.5rem'
          }}>
            📊 My Account
          </button>
          <button className="landing-btn" onClick={handleLogout} style={{ 
            minWidth: '120px', 
            minHeight: '50px', 
            fontSize: '1rem',
            padding: '1rem 1.5rem'
          }}>
            Logout
          </button>
          <button className="landing-btn" onClick={() => navigate('/')} style={{ 
            minWidth: '120px', 
            minHeight: '50px', 
            fontSize: '1rem',
            padding: '1rem 1.5rem'
          }}>
            Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
