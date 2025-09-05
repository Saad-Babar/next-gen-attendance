import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebase';

function Account() {
  const [user, setUser] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const navigate = useNavigate();

  useEffect(() => {
    // Get user data from localStorage (same as Dashboard)
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      const userData = JSON.parse(currentUser);
      setUser(userData);
      
      // Load attendance history for this user
      loadAttendanceHistory(userData.empId);
    } else {
      navigate('/login');
    }
    setLoading(false);
  }, [navigate]);

  // Auto-logout timer
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      localStorage.removeItem('currentUser');
      navigate('/login');
    }
  }, [timeLeft, navigate]);

  const loadAttendanceHistory = async (empId) => {
    try {
      const attendanceRef = collection(db, 'attendance');
      const q = query(
        attendanceRef,
        where('empId', '==', empId)
      );
      const querySnapshot = await getDocs(q);
      
      const history = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date()
        };
      });
      
      // Sort by timestamp (newest first)
      history.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log('Loaded attendance history:', history);
      setAttendanceHistory(history);
    } catch (error) {
      console.error('Error loading attendance history:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    navigate('/login');
  };

  const formatDate = (date) => {
    try {
      if (!date) return 'N/A';
      const dateObj = date instanceof Date ? date : new Date(date);
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
      return dateObj.toLocaleDateString('en-US', { 
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'N/A';
    }
  };

  const formatTime = (date) => {
    try {
      if (!date) return 'N/A';
      const dateObj = date instanceof Date ? date : new Date(date);
      if (isNaN(dateObj.getTime())) return 'Invalid Time';
      return dateObj.toLocaleTimeString('en-US', { 
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting time:', error);
      return 'N/A';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'late': return '#ff6b6b';
      case 'early': return '#ffa726';
      case 'on-time': return '#4caf50';
      default: return '#61dafb';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'late': return 'Late';
      case 'early': return 'Early';
      case 'on-time': return 'On Time';
      default: return 'Normal';
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
    return null;
  }

  return (
    <div className="landing-container">
      <div className="landing-header">
        <h1>My Account</h1>
        <p className="landing-description">Welcome back, {user.name}!</p>
        <div style={{ 
          color: timeLeft <= 10 ? '#ff6b6b' : '#61dafb', 
          fontSize: '0.9em', 
          marginTop: '0.5rem',
          fontWeight: '500'
        }}>
          Auto-logout in: {timeLeft}s
        </div>
      </div>

      <div className="auth-form" style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
        {/* Profile Section */}
        <div style={{ 
          background: 'rgba(255,255,255,0.1)', 
          padding: '1.5rem', 
          borderRadius: '12px',
          marginBottom: '1rem'
        }}>
          <h3 style={{ color: '#61dafb', marginBottom: '1rem', textAlign: 'center' }}>Profile Details</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <strong style={{ color: '#e0e7ff', fontSize: '1rem' }}>Name:</strong>
              <div style={{ color: '#fff', marginTop: '4px', fontSize: '1.1rem' }}>{user.name}</div>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong style={{ color: '#e0e7ff', fontSize: '1rem' }}>Email:</strong>
              <div style={{ color: '#fff', marginTop: '4px', fontSize: '1.1rem' }}>{user.email}</div>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong style={{ color: '#e0e7ff', fontSize: '1rem' }}>Phone:</strong>
              <div style={{ color: '#fff', marginTop: '4px', fontSize: '1.1rem' }}>{user.phone}</div>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong style={{ color: '#e0e7ff', fontSize: '1rem' }}>Branch:</strong>
              <div style={{ color: '#fff', marginTop: '4px', fontSize: '1.1rem' }}>{user.branch}</div>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong style={{ color: '#e0e7ff', fontSize: '1rem' }}>Role:</strong>
              <div style={{ color: '#fff', marginTop: '4px', fontSize: '1.1rem', textTransform: 'capitalize' }}>{user.role}</div>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong style={{ color: '#e0e7ff', fontSize: '1rem' }}>Employee ID:</strong>
              <div style={{ color: '#fff', marginTop: '4px', fontSize: '1.1rem' }}>{user.empId}</div>
            </div>
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

        {/* Attendance History Section */}
        <div style={{ 
          background: 'rgba(255,255,255,0.1)', 
          padding: '1.5rem', 
          borderRadius: '12px',
          marginBottom: '1rem'
        }}>
          <h3 style={{ color: '#61dafb', marginBottom: '1rem', textAlign: 'center' }}>My Attendance History</h3>
          
          {attendanceHistory.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#61dafb', padding: '2rem' }}>
              <p>No attendance records found.</p>
            </div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {attendanceHistory.map((record) => (
                <div key={record.id} style={{
                  background: 'rgba(255,255,255,0.05)',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  border: `2px solid ${getStatusColor(record.status)}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <strong style={{ color: '#61dafb', textTransform: 'uppercase' }}>
                        {record.type === 'checkin' ? 'Check In' : 'Check Out'}
                      </strong>
                    </div>
                    <div style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '20px',
                      backgroundColor: getStatusColor(record.status),
                      color: '#fff',
                      fontSize: '0.8rem',
                      fontWeight: 'bold'
                    }}>
                      {getStatusText(record.status)}
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#e0e7ff' }}>
                    <div><strong>Date:</strong> {formatDate(record.timestamp)}</div>
                    <div><strong>Time:</strong> {formatTime(record.timestamp)}</div>
                    {record.location && (
                      <div><strong>Location:</strong> {record.branch || 'Branch A'}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="landing-btn" onClick={() => navigate('/dashboard')} style={{ 
            minWidth: '120px', 
            minHeight: '50px', 
            fontSize: '1rem',
            padding: '1rem 1.5rem'
          }}>
            📱 Dashboard
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

export default Account;