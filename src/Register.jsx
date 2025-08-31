import React, { useState, useRef } from 'react';
import './App.css';
import { db, storage } from './firebase';
import { collection, addDoc, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const BRANCHES = [
  'Head Office',
  'Branch A',
  'Branch B',
  'Branch C',
  'Branch D',
];

function Register() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    branch: '',
    role: '',
    image: null,
    imageUrl: '',
    location: null,
  });
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  let stream = useRef(null);

  const handleChange = (e) => {
    const newForm = { ...form, [e.target.name]: e.target.value };
    setForm(newForm);
    
    // Real-time password validation
    if (e.target.name === 'password' || e.target.name === 'confirmPassword') {
      if (newForm.password && newForm.confirmPassword) {
        if (newForm.password !== newForm.confirmPassword) {
          setPasswordError('Passwords do not match!');
        } else {
          setPasswordError('');
        }
      } else {
        setPasswordError('');
      }
    }
  };

  const openCamera = async () => {
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

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      canvasRef.current.toBlob((blob) => {
        const imageUrl = URL.createObjectURL(blob);
        setForm((prev) => ({ ...prev, image: blob, imageUrl }));
      }, 'image/jpeg');
      // Stop the camera
      if (stream.current) {
        stream.current.getTracks().forEach((track) => track.stop());
      }
      setShowCamera(false);
      // Get geolocation at the moment of capture with consistent settings
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            console.log('Registration - Raw GPS:', position.coords.latitude, position.coords.longitude);
            console.log('Registration - Accuracy:', position.coords.accuracy, 'meters');
            // Only accept if accuracy is good (less than or equal to 50 meters)
            if (position.coords.accuracy <= 50) {
              // Round coordinates to 6 decimal places for consistency
              const roundedLocation = {
                lat: Math.round(position.coords.latitude * 1000000) / 1000000,
                lng: Math.round(position.coords.longitude * 1000000) / 1000000,
              };
              console.log('Registration - Accuracy:', position.coords.accuracy, 'meters');
              console.log('Registration - Rounded GPS:', roundedLocation.lat, roundedLocation.lng);
              setForm((prev) => ({
                ...prev,
                location: roundedLocation,
              }));
            } else {
              // Show error and do not set location
              alert(`Location accuracy is too poor (${position.coords.accuracy} meters). Please try again in an open area or with better signal.`);
              setForm((prev) => ({ ...prev, location: null }));
            }
          },
          (err) => {
            console.error('Registration location error:', err);
            setForm((prev) => ({ ...prev, location: null }));
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSubmitError('');
    setSuccess(false);
    
    // Validate passwords match
    if (form.password !== form.confirmPassword) {
      setSubmitError('Passwords do not match!');
      setLoading(false);
      return;
    }
    
    // Validate password strength
    if (form.password.length < 6) {
      setSubmitError('Password must be at least 6 characters long!');
      setLoading(false);
      return;
    }
    
    // Check if location was captured
    if (!form.location) {
      setSubmitError('Location not captured. Please capture your photo again to get location.');
      setLoading(false);
      return;
    }
    
    try {
      // Check if email already exists
      const emailQuery = query(collection(db, 'users'), where('email', '==', form.email));
      const emailSnapshot = await getDocs(emailQuery);
      
      if (!emailSnapshot.empty) {
        setSubmitError('Email already registered! Please use a different email.');
        setLoading(false);
        return;
      }
      
      // Check if phone already exists
      const phoneQuery = query(collection(db, 'users'), where('phone', '==', form.phone));
      const phoneSnapshot = await getDocs(phoneQuery);
      
      if (!phoneSnapshot.empty) {
        setSubmitError('Phone number already registered! Please use a different phone number.');
        setLoading(false);
        return;
      }
      // Skip image upload for now (requires paid Firebase plan)
      let uploadedImageUrl = '';
      if (form.image) {
        // Convert image to base64 for local storage (temporary solution)
        const reader = new FileReader();
        reader.onload = () => {
          uploadedImageUrl = reader.result;
        };
        reader.readAsDataURL(form.image);
        // Wait for the reader to complete
        await new Promise(resolve => {
          reader.onloadend = resolve;
        });
      }
      // Generate unique employee ID
      const empId = `EMP${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      console.log('Generated empId:', empId);
      
      // Save user data to Firestore
      console.log('Saving user data to Firestore...');
      const userDocRef = await addDoc(collection(db, 'users'), {
        empId: empId,
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password, // Note: In production, hash this password!
        branch: form.branch,
        role: form.role,
        imageUrl: uploadedImageUrl,
        location: form.location,
        registeredAt: Timestamp.now(),
      });
      console.log('User saved with ID:', userDocRef.id);
      
      // Save employee data to empdata collection
      console.log('Saving employee data to empdata collection...');
      const empDocRef = await addDoc(collection(db, 'empdata'), {
        empId: empId,
        userId: userDocRef.id,
        name: form.name,
        email: form.email,
        phone: form.phone,
        branch: form.branch,
        role: form.role,
        imageUrl: uploadedImageUrl,
        location: form.location,
        registeredAt: Timestamp.now(),
        totalCheckIns: 0,
        totalCheckOuts: 0,
        totalLateCheckIns: 0,
        totalEarlyCheckOuts: 0,
        attendanceRecords: []
      });
      console.log('Employee data saved with ID:', empDocRef.id);
      setSuccess(true);
      setForm({
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        branch: '',
        role: '',
        image: null,
        imageUrl: '',
        location: null,
      });
      setPasswordError('');
    } catch (err) {
      setSubmitError('Registration failed. Please try again.');
      console.error('Registration error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Note: Geolocation API uses device GPS/location, not IP, so VPN has no effect.

  return (
    <div className="landing-container">
      <div className="landing-header">
        <h1>Register</h1>
        <p className="landing-description">Create your account to use the attendance system.</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          type="text"
          name="name"
          placeholder="Full Name"
          value={form.name}
          onChange={handleChange}
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
        />
        <input
          type="tel"
          name="phone"
          placeholder="Phone Number"
          value={form.phone}
          onChange={handleChange}
          required
          pattern="[0-9]{10,15}"
          title="Please enter a valid phone number"
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          required
          minLength="6"
        />
        <input
          type="password"
          name="confirmPassword"
          placeholder="Confirm Password"
          value={form.confirmPassword}
          onChange={handleChange}
          required
          minLength="6"
        />
        {passwordError && (
          <div style={{ color: '#ff6b6b', fontSize: '0.9em', marginTop: '4px', textAlign: 'center' }}>
            {passwordError}
          </div>
        )}
        <select
          name="branch"
          value={form.branch}
          onChange={handleChange}
          required
        >
          <option value="" disabled>Select Branch</option>
          {BRANCHES.map((branch) => (
            <option key={branch} value={branch}>{branch}</option>
          ))}
        </select>
        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          required
        >
          <option value="" disabled>Select Role</option>
          <option value="manager">Manager</option>
          <option value="salesman">Salesman</option>
        </select>
        <label style={{ color: '#e0e7ff', fontWeight: 500, marginBottom: 4 }}>
          Capture Your Photo (Real-time):
        </label>
        {!form.imageUrl && (
          <button type="button" className="landing-btn" onClick={openCamera} style={{marginBottom: '1rem'}}>Open Camera</button>
        )}
        {cameraError && <div style={{ color: '#ff6b6b', marginBottom: 8 }}>{cameraError}</div>}
        {showCamera && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1rem' }}>
            <video ref={videoRef} style={{ width: 220, height: 220, borderRadius: '50%', objectFit: 'cover', background: '#222' }} />
            <button type="button" className="landing-btn" onClick={capturePhoto} style={{marginTop: '1rem'}}>Capture Photo</button>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
        )}
        {form.imageUrl && (
          <img
            src={form.imageUrl}
            alt="Preview"
            style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 1rem' }}
          />
        )}
        <button className="landing-btn" type="submit" disabled={loading}>{loading ? 'Registering...' : 'Register'}</button>
        {submitError && <div style={{ color: '#ff6b6b', marginTop: 8 }}>{submitError}</div>}
        {success && <div style={{ color: '#61dafb', marginTop: 8 }}>Registration successful!</div>}
      </form>
      <button className="landing-btn" onClick={() => window.location.href = '/'} style={{marginTop: '1rem'}}>Back to Home</button>
    </div>
  );
}

export default Register;
