import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { db } from './firebase';
import { collection, addDoc, Timestamp, query, where, getDocs, orderBy, limit, updateDoc } from 'firebase/firestore';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(60); // 60 seconds countdown
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
  let stream = useRef(null);

  useEffect(() => {
    // Get user data from localStorage
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      setUser(JSON.parse(currentUser));
    }
    setLoading(false);
    
    // Get server time from third-party API
    fetchServerTime();
  }, []);

  const fetchServerTime = async () => {
    try {
      const response = await fetch('https://worldtimeapi.org/api/timezone/Asia/Karachi');
      const data = await response.json();
      setServerTime(new Date(data.datetime));
    } catch (error) {
      console.error('Failed to fetch server time:', error);
      // Fallback to local time if API fails
      setServerTime(new Date());
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
      setTimeLeft(60);
      
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
      }, 60000); // 60 seconds
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
    window.location.href = '/';
  };

  const openCamera = async (type) => {
    setAttendanceType(type);
    setCameraError('');
    setShowCamera(true);
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
            if (position.coords.accuracy <= 50) {
              currentLocation = {
                lat: Math.round(position.coords.latitude * 1000000) / 1000000,
                lng: Math.round(position.coords.longitude * 1000000) / 1000000
              };
              console.log('Good accuracy achieved, using this location');
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
      
      // Verify face (simple comparison - in production use proper face recognition)
      const capturedImage = canvas.toDataURL('image/jpeg');
      console.log('Captured image length:', capturedImage.length);
      
      const isFaceMatch = await verifyFace(capturedImage, user.imageUrl);
      console.log('Face match result:', isFaceMatch);
      
      if (!isFaceMatch) {
        showPopupMessage('Face verification failed. Please try again.', 'error');
        return;
      }
      
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

  const verifyFace = async (capturedImage, registeredImage) => {
    // Enhanced face verification
    if (!capturedImage || !registeredImage) {
      return false;
    }
    
    // Simple image comparison (in production, use proper face recognition API like AWS Rekognition, Azure Face API, or Google Vision)
    // For now, we'll do a basic check by comparing image sizes and basic properties
    try {
      const capturedImg = new Image();
      const registeredImg = new Image();
      
      return new Promise((resolve) => {
        capturedImg.onload = () => {
          registeredImg.onload = () => {
            // Basic comparison - in production, use proper face recognition
            const isMatch = Math.abs(capturedImg.width - registeredImg.width) < 50 && 
                           Math.abs(capturedImg.height - registeredImg.height) < 50;
            resolve(isMatch);
          };
          registeredImg.src = registeredImage;
        };
        capturedImg.src = capturedImage;
      });
    } catch (error) {
      console.error('Face verification error:', error);
      return false;
    }
  };

  const showPopupMessage = (message, type) => {
    setPopupMessage(message);
    setPopupType(type);
    setShowPopup(true);
    setTimeout(() => {
      setShowPopup(false);
    }, 5000); // Auto-hide after 5 seconds
  };

  const processAttendance = async (type, location) => {
    if (!serverTime) {
      showPopupMessage('Server time not available. Please try again.', 'error');
      return;
    }

    const currentTime = serverTime;
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
      // Create attendance record
      const attendanceRecord = {
        type: type,
        timestamp: Timestamp.now(),
        serverTime: currentTime.toISOString(),
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
          <button className="landing-btn" onClick={() => window.location.href = '/login'}>
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
        <div style={{ 
          color: timeLeft <= 10 ? '#ff6b6b' : '#61dafb', 
          fontSize: '0.9em', 
          marginTop: '0.5rem',
          fontWeight: '500'
        }}>
          Auto-logout in: {timeLeft}s
        </div>
      </div>
      
      <div className="auth-form" style={{ maxWidth: '500px', margin: '0 auto' }}>
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
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1rem' }}>
          <button className="landing-btn" onClick={() => openCamera('checkin')}>
            Check In
          </button>
          <button className="landing-btn" onClick={() => openCamera('checkout')}>
            Check Out
          </button>
        </div>
        
        {showCamera && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1rem' }}>
            <video 
              ref={videoRef} 
              style={{ width: 220, height: 220, borderRadius: '50%', objectFit: 'cover', background: '#222' }}
              autoPlay
              playsInline
            />
            <button className="landing-btn" onClick={capturePhoto} style={{marginTop: '1rem'}}>
              Capture Photo
            </button>
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
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button className="landing-btn" onClick={handleLogout}>
            Logout
          </button>
          <button className="landing-btn" onClick={() => window.location.href = '/'}>
            Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
