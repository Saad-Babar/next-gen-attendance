import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

function AdminAcc() {
  const [user, setUser] = useState(null);
  const [inactiveUsers, setInactiveUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [reportType, setReportType] = useState('summary'); // 'summary' or 'detailed'
  const [availableBranches, setAvailableBranches] = useState([]);
  const [generatingReport, setGeneratingReport] = useState(false);
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
      
      // Load inactive users, all users, and branches
      loadInactiveUsers();
      loadAllUsers();
      loadAvailableBranches();
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

  const loadAvailableBranches = async () => {
    try {
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);
      
      const branches = new Set();
      querySnapshot.docs.forEach(doc => {
        const userData = doc.data();
        if (userData.branch) {
          branches.add(userData.branch);
        }
      });
      
      setAvailableBranches(Array.from(branches).sort());
    } catch (error) {
      console.error('Error loading branches:', error);
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

  const fetchAttendanceData = async (startDate, endDate, branch) => {
    try {
      const attendanceRef = collection(db, 'attendance');
      let q = query(
        attendanceRef,
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
      );

      if (branch !== 'all') {
        q = query(
          attendanceRef,
          where('date', '>=', startDate),
          where('date', '<=', endDate),
          where('branch', '==', branch),
          orderBy('date', 'desc')
        );
      }

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching attendance data:', error);
      return [];
    }
  };

  const generateSummaryReport = (attendanceData, branch) => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.text('Attendance Summary Report', 20, 20);
    
    // Report details
    doc.setFontSize(12);
    doc.text(`Branch: ${branch === 'all' ? 'All Branches' : branch}`, 20, 35);
    doc.text(`Date Range: ${reportStartDate} to ${reportEndDate}`, 20, 45);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 55);
    
    // Summary statistics
    const totalRecords = attendanceData.length;
    const checkIns = attendanceData.filter(record => record.type === 'checkin').length;
    const checkOuts = attendanceData.filter(record => record.type === 'checkout').length;
    const onTime = attendanceData.filter(record => record.status === 'on_time').length;
    const late = attendanceData.filter(record => record.status === 'late').length;
    const early = attendanceData.filter(record => record.status === 'early').length;
    
    doc.text(`Total Records: ${totalRecords}`, 20, 75);
    doc.text(`Check-ins: ${checkIns}`, 20, 85);
    doc.text(`Check-outs: ${checkOuts}`, 20, 95);
    doc.text(`On Time: ${onTime}`, 20, 105);
    doc.text(`Late: ${late}`, 20, 115);
    doc.text(`Early: ${early}`, 20, 125);
    
    // Branch-wise summary if all branches
    if (branch === 'all') {
      const branchSummary = {};
      attendanceData.forEach(record => {
        if (!branchSummary[record.branch]) {
          branchSummary[record.branch] = { total: 0, checkins: 0, checkouts: 0 };
        }
        branchSummary[record.branch].total++;
        if (record.type === 'checkin') branchSummary[record.branch].checkins++;
        if (record.type === 'checkout') branchSummary[record.branch].checkouts++;
      });
      
      doc.text('Branch-wise Summary:', 20, 145);
      let yPos = 155;
      Object.entries(branchSummary).forEach(([branchName, data]) => {
        doc.text(`${branchName}: ${data.total} records (${data.checkins} check-ins, ${data.checkouts} check-outs)`, 30, yPos);
        yPos += 10;
      });
    }
    
    return doc;
  };

  const generateDetailedReport = (attendanceData, branch) => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.text('Detailed Attendance Report', 20, 20);
    
    // Report details
    doc.setFontSize(12);
    doc.text(`Branch: ${branch === 'all' ? 'All Branches' : branch}`, 20, 35);
    doc.text(`Date Range: ${reportStartDate} to ${reportEndDate}`, 20, 45);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 55);
    
    // Prepare table data
    const tableData = attendanceData.map(record => [
      record.userName || 'N/A',
      record.userEmail || 'N/A',
      record.branch || 'N/A',
      record.type === 'checkin' ? 'Check In' : 'Check Out',
      record.status === 'on_time' ? 'On Time' : record.status === 'late' ? 'Late' : 'Early',
      record.date || 'N/A',
      record.timestamp ? new Date(record.timestamp.seconds * 1000).toLocaleTimeString() : 'N/A'
    ]);
    
    // Add table
    doc.autoTable({
      head: [['Name', 'Email', 'Branch', 'Type', 'Status', 'Date', 'Time']],
      body: tableData,
      startY: 75,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [97, 218, 251] }
    });
    
    return doc;
  };

  const openReportModal = () => {
    // Set default date range (last 30 days)
    const today = new Date();
    const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    setReportStartDate(lastMonth.toISOString().split('T')[0]);
    setReportEndDate(today.toISOString().split('T')[0]);
    
    setShowReportModal(true);
  };

  const handleGenerateReport = async () => {
    if (!reportStartDate || !reportEndDate) {
      alert('Please select both start and end dates.');
      return;
    }
    
    setGeneratingReport(true);
    
    try {
      const attendanceData = await fetchAttendanceData(reportStartDate, reportEndDate, selectedBranch);
      
      if (attendanceData.length === 0) {
        alert('No attendance data found for the selected criteria.');
        setGeneratingReport(false);
        return;
      }
      
      let doc;
      if (reportType === 'summary') {
        doc = generateSummaryReport(attendanceData, selectedBranch);
      } else {
        doc = generateDetailedReport(attendanceData, selectedBranch);
      }
      
      // Generate filename
      const branchName = selectedBranch === 'all' ? 'AllBranches' : selectedBranch.replace(/\s+/g, '');
      const filename = `AttendanceReport_${branchName}_${reportStartDate}_to_${reportEndDate}_${reportType}.pdf`;
      
      // Save the PDF
      doc.save(filename);
      
      setShowReportModal(false);
      alert('Report generated successfully!');
      
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setGeneratingReport(false);
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

        {/* Report Generation Section */}
        <div style={{ 
          background: 'rgba(255,255,255,0.1)', 
          padding: '1.5rem', 
          borderRadius: '12px',
          marginBottom: '1rem'
        }}>
          <h3 style={{ color: '#61dafb', marginBottom: '1rem', textAlign: 'center' }}>
            📊 Generate Attendance Reports
          </h3>
          
          <div style={{ textAlign: 'center' }}>
            <button 
              className="landing-btn" 
              onClick={openReportModal}
              style={{ 
                minWidth: '200px', 
                minHeight: '50px', 
                fontSize: '1.1rem',
                padding: '1rem 1.5rem',
                backgroundColor: '#4caf50'
              }}
            >
              📄 Generate PDF Report
            </button>
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

        {/* Report Generation Modal */}
        {showReportModal && (
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
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              border: '2px solid rgba(255,255,255,0.2)'
            }}>
              <h3 style={{ 
                color: '#fff', 
                marginBottom: '1.5rem',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                textAlign: 'center'
              }}>
                📊 Generate Attendance Report
              </h3>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Report Type:
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #ccc',
                    fontSize: '1rem',
                    backgroundColor: '#fff'
                  }}
                >
                  <option value="summary">Summary Report</option>
                  <option value="detailed">Detailed Report</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Branch:
                </label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #ccc',
                    fontSize: '1rem',
                    backgroundColor: '#fff'
                  }}
                >
                  <option value="all">All Branches</option>
                  {availableBranches.map(branch => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  📅 Start Date:
                </label>
                <div 
                  style={{
                    position: 'relative',
                    cursor: 'pointer'
                  }}
                  onClick={(e) => {
                    // Find the input and trigger calendar
                    const input = e.currentTarget.querySelector('input[type="date"]');
                    if (input) {
                      input.focus();
                      input.click();
                      // Try to open calendar picker if supported
                      if (input.showPicker) {
                        input.showPicker();
                      }
                    }
                  }}
                >
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #ccc',
                      fontSize: '1rem',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'border-color 0.3s ease',
                      WebkitAppearance: 'none',
                      MozAppearance: 'textfield',
                      appearance: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#61dafb'}
                    onBlur={(e) => e.target.style.borderColor = '#ccc'}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Force calendar to open on any click
                      if (e.target.showPicker) {
                        e.target.showPicker();
                      }
                    }}
                    placeholder="Select start date"
                  />
                </div>
                <div style={{ fontSize: '0.8rem', color: '#e0e7ff', marginTop: '0.25rem' }}>
                  Click anywhere on the date field to open calendar picker
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  📅 End Date:
                </label>
                <div 
                  style={{
                    position: 'relative',
                    cursor: 'pointer'
                  }}
                  onClick={(e) => {
                    // Find the input and trigger calendar
                    const input = e.currentTarget.querySelector('input[type="date"]');
                    if (input) {
                      input.focus();
                      input.click();
                      // Try to open calendar picker if supported
                      if (input.showPicker) {
                        input.showPicker();
                      }
                    }
                  }}
                >
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    min={reportStartDate || undefined}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #ccc',
                      fontSize: '1rem',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'border-color 0.3s ease',
                      WebkitAppearance: 'none',
                      MozAppearance: 'textfield',
                      appearance: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#61dafb'}
                    onBlur={(e) => e.target.style.borderColor = '#ccc'}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Force calendar to open on any click
                      if (e.target.showPicker) {
                        e.target.showPicker();
                      }
                    }}
                    placeholder="Select end date"
                  />
                </div>
                <div style={{ fontSize: '0.8rem', color: '#e0e7ff', marginTop: '0.25rem' }}>
                  Click anywhere on the date field to open calendar picker
                </div>
              </div>

              {/* Quick Date Range Presets */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  ⚡ Quick Presets:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                      setReportStartDate(lastWeek.toISOString().split('T')[0]);
                      setReportEndDate(today.toISOString().split('T')[0]);
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.3)',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                      setReportStartDate(lastMonth.toISOString().split('T')[0]);
                      setReportEndDate(today.toISOString().split('T')[0]);
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.3)',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                  >
                    Last 30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                      setReportStartDate(firstDayOfMonth.toISOString().split('T')[0]);
                      setReportEndDate(today.toISOString().split('T')[0]);
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.3)',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
                      setReportStartDate(firstDayOfYear.toISOString().split('T')[0]);
                      setReportEndDate(today.toISOString().split('T')[0]);
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.3)',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                  >
                    This Year
                  </button>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#e0e7ff', marginTop: '0.5rem' }}>
                  Click any preset to auto-fill date range
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button 
                  className="landing-btn" 
                  onClick={() => setShowReportModal(false)}
                  style={{ 
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    minWidth: '100px'
                  }}
                >
                  Cancel
                </button>
                <button 
                  className="landing-btn" 
                  onClick={handleGenerateReport}
                  disabled={generatingReport}
                  style={{ 
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    minWidth: '100px',
                    opacity: generatingReport ? 0.6 : 1
                  }}
                >
                  {generatingReport ? 'Generating...' : 'Generate PDF'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminAcc;