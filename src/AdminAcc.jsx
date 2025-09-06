import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

function AdminAcc() {
  const [user, setUser] = useState(null);
  const [inactiveUsers, setInactiveUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const navigate = useNavigate();

  useEffect(() => {
    // Get user data from localStorage
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      const userData = JSON.parse(currentUser);
      setUser(userData);
      
      // Check if user is admin
      console.log('AdminAcc - User data:', userData);
      console.log('AdminAcc - User role:', userData.role);
      console.log('AdminAcc - Role comparison (case-insensitive):', userData.role?.toLowerCase() === 'admin');
      
      if (userData.role?.toLowerCase() !== 'admin') {
        console.log('AdminAcc - Non-admin user, redirecting to dashboard...');
        navigate('/dashboard');
        return;
      }
      
      // Load inactive users and all users
      loadInactiveUsers();
      loadAllUsers();
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

  const loadInactiveUsers = async () => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('status', '==', 'inactive'));
      const querySnapshot = await getDocs(q);
      
      const inactive = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setInactiveUsers(inactive);
    } catch (error) {
      console.error('Error loading inactive users:', error);
    }
  };

  const loadAllUsers = async () => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('registeredAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const users = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setAllUsers(users);
    } catch (error) {
      console.error('Error loading all users:', error);
    }
  };

  const activateUser = async (userId) => {
    try {
      // Get user data to find empId
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data();
      
      // Update users collection
      await updateDoc(userRef, { status: 'active' });
      
      // Find and update empdata collection using empId
      if (userData.empId) {
        const empdataQuery = query(collection(db, 'empdata'), where('empId', '==', userData.empId));
        const empdataSnapshot = await getDocs(empdataQuery);
        
        if (!empdataSnapshot.empty) {
          const empdataDoc = empdataSnapshot.docs[0];
          await updateDoc(empdataDoc.ref, { status: 'active' });
        }
      }
      
      // Reload data
      loadInactiveUsers();
      loadAllUsers();
      
      alert('User activated successfully!');
    } catch (error) {
      console.error('Error activating user:', error);
      alert('Failed to activate user. Please try again.');
    }
  };

  const deactivateUser = async (userId) => {
    // Prevent admin from deactivating themselves
    if (userId === user.id) {
      alert('You cannot deactivate your own account!');
      return;
    }

    // Confirm deactivation
    const confirmed = window.confirm('Are you sure you want to deactivate this user? They will not be able to login until reactivated.');
    
    if (!confirmed) {
      return;
    }

    try {
      // Get user data to find empId
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data();
      
      // Update users collection
      await updateDoc(userRef, { status: 'inactive' });
      
      // Find and update empdata collection using empId
      if (userData.empId) {
        const empdataQuery = query(collection(db, 'empdata'), where('empId', '==', userData.empId));
        const empdataSnapshot = await getDocs(empdataQuery);
        
        if (!empdataSnapshot.empty) {
          const empdataDoc = empdataSnapshot.docs[0];
          await updateDoc(empdataDoc.ref, { status: 'inactive' });
        }
      }
      
      // Reload data
      loadInactiveUsers();
      loadAllUsers();
      
      alert('User deactivated successfully!');
    } catch (error) {
      console.error('Error deactivating user:', error);
      alert('Failed to deactivate user. Please try again.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    navigate('/login');
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
        <h1>Admin Dashboard</h1>
        <p className="landing-description">Welcome, {user.name}! Manage your organization.</p>
        <div style={{ 
          color: timeLeft <= 10 ? '#ff6b6b' : '#61dafb', 
          fontSize: '0.9em', 
          marginTop: '0.5rem',
          fontWeight: '500'
        }}>
          Auto-logout in: {timeLeft}s
        </div>
      </div>

      <div className="auth-form" style={{ maxWidth: '1000px', margin: '0 auto', padding: '1rem' }}>
        {/* Pending Approvals Section */}
        <div style={{ 
          background: 'rgba(255,255,255,0.1)', 
          padding: '1.5rem', 
          borderRadius: '12px',
          marginBottom: '1rem'
        }}>
          <h3 style={{ color: '#61dafb', marginBottom: '1rem', textAlign: 'center' }}>
            Pending User Approvals ({inactiveUsers.length})
          </h3>
          
          {inactiveUsers.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#61dafb', padding: '2rem' }}>
              <p>No pending approvals.</p>
            </div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {inactiveUsers.map((user) => (
                <div key={user.id} style={{
                  background: 'rgba(255,255,255,0.05)',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  border: '2px solid #ffa726',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                     <div>
                       <strong style={{ color: '#61dafb' }}>{user.name}</strong>
                       <div style={{ fontSize: '0.9rem', color: '#e0e7ff' }}>
                         {user.email} • {user.phone} • {user.branch} • {user.role}
                       </div>
                     </div>
                     <div style={{ display: 'flex', gap: '0.5rem' }}>
                       <button 
                         className="landing-btn" 
                         onClick={() => activateUser(user.id)}
                         style={{ 
                           minWidth: '100px', 
                           minHeight: '40px', 
                           fontSize: '0.9rem',
                           padding: '0.5rem 1rem',
                           backgroundColor: '#4caf50'
                         }}
                       >
                         Activate
                       </button>
                     </div>
                   </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All Users Section */}
        <div style={{ 
          background: 'rgba(255,255,255,0.1)', 
          padding: '1.5rem', 
          borderRadius: '12px',
          marginBottom: '1rem'
        }}>
          <h3 style={{ color: '#61dafb', marginBottom: '1rem', textAlign: 'center' }}>
            All Users ({allUsers.length})
          </h3>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
             {allUsers.map((userItem) => (
              <div key={userItem.id} style={{
                background: 'rgba(255,255,255,0.05)',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '0.5rem',
                border: `2px solid ${userItem.status === 'active' ? '#4caf50' : '#ffa726'}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <strong style={{ color: '#61dafb' }}>{userItem.name}</strong>
                    <div style={{ fontSize: '0.9rem', color: '#e0e7ff' }}>
                      {userItem.email} • {userItem.phone} • {userItem.branch} • {userItem.role}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: userItem.status === 'active' ? '#4caf50' : '#ffa726' }}>
                      Status: {userItem.status.toUpperCase()}
                      {userItem.id === user.id && (
                        <span style={{ marginLeft: '8px', color: '#61dafb', fontWeight: 'bold' }}>
                          (YOU)
                        </span>
                      )}
                    </div>
                  </div>
                   <div style={{ display: 'flex', gap: '0.5rem' }}>
                     {userItem.status === 'inactive' ? (
                       <button 
                         className="landing-btn" 
                         onClick={() => activateUser(userItem.id)}
                         style={{ 
                           minWidth: '100px', 
                           minHeight: '40px', 
                           fontSize: '0.9rem',
                           padding: '0.5rem 1rem',
                           backgroundColor: '#4caf50'
                         }}
                       >
                         Activate
                       </button>
                     ) : (
                       // Don't show deactivate button for current admin user
                       userItem.id !== user.id && (
                         <button 
                           className="landing-btn" 
                           onClick={() => deactivateUser(userItem.id)}
                           style={{ 
                             minWidth: '100px', 
                             minHeight: '40px', 
                             fontSize: '0.9rem',
                             padding: '0.5rem 1rem',
                             backgroundColor: '#ff6b6b'
                           }}
                         >
                           Deactivate
                         </button>
                       )
                     )}
                   </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="landing-btn" onClick={() => navigate('/account')} style={{ 
            minWidth: '120px', 
            minHeight: '50px', 
            fontSize: '1rem',
            padding: '1rem 1.5rem'
          }}>
            📱 My Account
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

export default AdminAcc;