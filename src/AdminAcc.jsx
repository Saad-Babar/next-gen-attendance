import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, updateDoc, doc, getDoc, addDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [leaveApplications, setLeaveApplications] = useState([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
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
      
      // Load inactive users, all users, branches, and leave applications
      loadInactiveUsers();
      loadAllUsers();
      loadAvailableBranches();
      loadLeaveApplications();
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

  const loadLeaveApplications = async () => {
    try {
      const leaveRef = collection(db, 'leaveApplications');
      const q = query(leaveRef, orderBy('appliedAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const applications = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setLeaveApplications(applications);
    } catch (error) {
      console.error('Error loading leave applications:', error);
    }
  };

  const approveLeave = async (applicationId, empId, leaveDate) => {
    try {
      // Update leave application status
      const leaveRef = doc(db, 'leaveApplications', applicationId);
      await updateDoc(leaveRef, { 
        status: 'approved',
        approvedAt: Timestamp.now(),
        approvedBy: user.name
      });

      // Create attendance record for the leave day
      const leaveDateObj = new Date(leaveDate);
      const attendanceRecord = {
        empId: empId,
        userId: leaveApplications.find(app => app.id === applicationId)?.userId,
        userEmail: leaveApplications.find(app => app.id === applicationId)?.userEmail,
        userName: leaveApplications.find(app => app.id === applicationId)?.userName,
        branch: leaveApplications.find(app => app.id === applicationId)?.branch,
        role: leaveApplications.find(app => app.id === applicationId)?.role,
        type: 'leave',
        status: 'approved_leave',
        timestamp: Timestamp.fromDate(leaveDateObj),
        serverTime: leaveDateObj.toISOString(),
        date: leaveDate,
        leaveType: leaveApplications.find(app => app.id === applicationId)?.leaveType,
        leaveReason: leaveApplications.find(app => app.id === applicationId)?.reason
      };

      await addDoc(collection(db, 'attendance'), attendanceRecord);
      
      // Reload leave applications
      loadLeaveApplications();
      alert('Leave approved successfully!');
    } catch (error) {
      console.error('Error approving leave:', error);
      alert('Failed to approve leave. Please try again.');
    }
  };

  const rejectLeave = async (applicationId) => {
    try {
      const leaveRef = doc(db, 'leaveApplications', applicationId);
      await updateDoc(leaveRef, { 
        status: 'rejected',
        rejectedAt: Timestamp.now(),
        rejectedBy: user.name
      });
      
      loadLeaveApplications();
      alert('Leave application rejected.');
    } catch (error) {
      console.error('Error rejecting leave:', error);
      alert('Failed to reject leave. Please try again.');
    }
  };

  const fetchAttendanceData = async (startDate, endDate, branch) => {
    try {
      // Fetch all attendance data to avoid index issues
      const attendanceRef = collection(db, 'attendance');
      const q = query(attendanceRef);
      
      const querySnapshot = await getDocs(q);
      const allData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Filter data in JavaScript
      let filteredData = allData.filter(record => {
        const recordDate = record.date;
        return recordDate >= startDate && recordDate <= endDate;
      });
      
      // Filter by branch if not 'all'
      if (branch !== 'all') {
        filteredData = filteredData.filter(record => record.branch === branch);
      }
      
      // Also fetch leave applications for the date range
      const leaveRef = collection(db, 'leaveApplications');
      const leaveQuery = query(leaveRef);
      const leaveSnapshot = await getDocs(leaveQuery);
      const leaveApplications = leaveSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter approved leaves by date range
      const approvedLeaves = leaveApplications.filter(leave => 
        leave.status === 'approved' && 
        leave.leaveDate >= startDate && 
        leave.leaveDate <= endDate
      );

      // Sort the data in JavaScript
      const sortedData = filteredData.sort((a, b) => {
        // Sort by date descending, then by branch
        const dateCompare = new Date(b.date) - new Date(a.date);
        if (dateCompare !== 0) return dateCompare;
        return (a.branch || '').localeCompare(b.branch || '');
      });

      return { attendanceData: sortedData, leaveData: approvedLeaves };
      
    } catch (error) {
      console.error('Error fetching attendance data:', error);
      return [];
    }
  };

  const getLogoAsBase64 = async () => {
    try {
      // Create a canvas to convert SVG to PNG
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 200;
      canvas.height = 200;
      
      // Create an image element
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          // Draw the PNG to canvas with better quality
          ctx.drawImage(img, 0, 0, 200, 200);
          // Convert canvas to PNG base64
          const pngBase64 = canvas.toDataURL('image/png');
          resolve(pngBase64);
        };
        
        img.onerror = () => {
          console.error('Error loading SVG logo');
          resolve(null);
        };
        
        // Load the PNG (convert your SVG to PNG first)
        img.src = '/Khas_Logo.png';
      });
    } catch (error) {
      console.error('Error loading logo:', error);
      return null;
    }
  };

  const calculateSummaryStats = (attendanceData, leaveData, branch) => {
    const stats = {
      branchWise: {},
      overall: {
        totalEmployees: 0,
        presentDays: 0,
        absentDays: 0,
        lateComings: 0,
        earlyLeaves: 0,
        leavesApproved: 0,
        overtimeHours: 0,
        attendancePercentage: 0
      }
    };

    // Get unique employees by branch
    const employeesByBranch = {};
    const allEmployees = new Set();

    attendanceData.forEach(record => {
      const branchName = record.branch || 'Unknown Branch';
      if (!employeesByBranch[branchName]) {
        employeesByBranch[branchName] = new Set();
      }
      employeesByBranch[branchName].add(record.empId);
      allEmployees.add(record.empId);
    });

    // Count approved leaves by branch
    const leavesByBranch = {};
    leaveData.forEach(leave => {
      const branchName = leave.branch || 'Unknown Branch';
      if (!leavesByBranch[branchName]) {
        leavesByBranch[branchName] = 0;
      }
      leavesByBranch[branchName]++;
    });

    // Calculate branch-wise stats
    Object.entries(employeesByBranch).forEach(([branchName, employees]) => {
      const branchRecords = attendanceData.filter(record => record.branch === branchName);
      const checkIns = branchRecords.filter(record => record.type === 'checkin');
      const checkOuts = branchRecords.filter(record => record.type === 'checkout');
      
      stats.branchWise[branchName] = {
        totalEmployees: employees.size,
        presentDays: checkIns.length,
        absentDays: Math.max(0, employees.size * getWorkingDays() - checkIns.length),
        lateComings: checkIns.filter(record => record.status === 'late').length,
        earlyLeaves: checkOuts.filter(record => record.status === 'early').length,
        leavesApproved: leavesByBranch[branchName] || 0,
        overtimeHours: calculateOvertimeHours(checkIns, checkOuts),
        attendancePercentage: employees.size > 0 ? (checkIns.length / (employees.size * getWorkingDays())) * 100 : 0
      };
    });

    // Calculate overall stats
    const totalCheckIns = attendanceData.filter(record => record.type === 'checkin').length;
    const totalCheckOuts = attendanceData.filter(record => record.type === 'checkout').length;
    const totalLateComings = attendanceData.filter(record => record.type === 'checkin' && record.status === 'late').length;
    const totalEarlyLeaves = attendanceData.filter(record => record.type === 'checkout' && record.status === 'early').length;

    stats.overall = {
      totalEmployees: allEmployees.size,
      presentDays: totalCheckIns,
      absentDays: Math.max(0, allEmployees.size * getWorkingDays() - totalCheckIns),
      lateComings: totalLateComings,
      earlyLeaves: totalEarlyLeaves,
      leavesApproved: leaveData.length,
      overtimeHours: calculateOvertimeHours(
        attendanceData.filter(record => record.type === 'checkin'),
        attendanceData.filter(record => record.type === 'checkout')
      ),
      attendancePercentage: allEmployees.size > 0 ? (totalCheckIns / (allEmployees.size * getWorkingDays())) * 100 : 0
    };

    return stats;
  };

  const getWorkingDays = () => {
    // Calculate working days between start and end date
    const start = new Date(reportStartDate);
    const end = new Date(reportEndDate);
    let workingDays = 0;
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) { // Exclude weekends
        workingDays++;
      }
    }
    
    return Math.max(workingDays, 1); // At least 1 day
  };

  const calculateOvertimeHours = (checkIns, checkOuts) => {
    // Simple overtime calculation - can be enhanced based on business rules
    let totalOvertime = 0;
    
    checkIns.forEach(checkIn => {
      const checkOut = checkOuts.find(co => 
        co.empId === checkIn.empId && 
        co.date === checkIn.date
      );
      
      if (checkOut) {
        const inTime = new Date(checkIn.timestamp.seconds * 1000);
        const outTime = new Date(checkOut.timestamp.seconds * 1000);
        const hoursWorked = (outTime - inTime) / (1000 * 60 * 60);
        
        // Assuming 8 hours is standard work day
        if (hoursWorked > 8) {
          totalOvertime += hoursWorked - 8;
        }
      }
    });
    
    return Math.round(totalOvertime * 10) / 10; // Round to 1 decimal
  };

  const generateSummaryReport = async (attendanceData, leaveData, branch) => {
    const doc = new jsPDF();
    
    // Set font to Calibri (fallback to Arial)
    doc.setFont('helvetica', 'normal');
    
    // HEADER SECTION
    // Company Logo
    try {
      const logoBase64 = await getLogoAsBase64();
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 20, 10, 40, 25);
      } else {
        throw new Error('Logo not found');
      }
    } catch (error) {
      // Fallback to text if logo not found
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('KHAS', 20, 25);
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text('ATTENDANCE SYSTEM', 20, 35);
    }
    
    // Report Title - positioned below logo
    doc.setFontSize(18);
    doc.setTextColor(0, 0, 0);
    doc.text('ATTENDANCE SUMMARY REPORT', 20, 45);
    
    // Report Details - positioned below title
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Branch: ${branch === 'all' ? 'All Branches (Overall Pakistan)' : branch}`, 20, 60);
    doc.text(`Date Range: ${reportStartDate} to ${reportEndDate}`, 20, 68);
    doc.text(`Generated: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`, 20, 76);
    
    // Calculate comprehensive statistics
    const stats = calculateSummaryStats(attendanceData, leaveData, branch);
    
    // TABLE FORMAT - Summary Statistics
    const summaryData = [
      ['Branch Name', 'Total Employees', 'Present Days', 'Absent Days', 'Late Comings', 'Early Leaves', 'Leaves Approved', 'Overtime Hours', 'Attendance %']
    ];
    
    if (branch === 'all') {
      // Branch-wise data
      Object.entries(stats.branchWise).forEach(([branchName, data]) => {
        summaryData.push([
          branchName,
          data.totalEmployees.toString(),
          data.presentDays.toString(),
          data.absentDays.toString(),
          data.lateComings.toString(),
          data.earlyLeaves.toString(),
          data.leavesApproved.toString(),
          data.overtimeHours.toString(),
          `${data.attendancePercentage.toFixed(1)}%`
        ]);
      });
      
      // Overall totals
      summaryData.push([
        'TOTAL (All Branches)',
        stats.overall.totalEmployees.toString(),
        stats.overall.presentDays.toString(),
        stats.overall.absentDays.toString(),
        stats.overall.lateComings.toString(),
        stats.overall.earlyLeaves.toString(),
        stats.overall.leavesApproved.toString(),
        stats.overall.overtimeHours.toString(),
        `${stats.overall.attendancePercentage.toFixed(1)}%`
      ]);
    } else {
      // Single branch data
      summaryData.push([
        branch,
        stats.overall.totalEmployees.toString(),
        stats.overall.presentDays.toString(),
        stats.overall.absentDays.toString(),
        stats.overall.lateComings.toString(),
        stats.overall.earlyLeaves.toString(),
        stats.overall.leavesApproved.toString(),
        stats.overall.overtimeHours.toString(),
        `${stats.overall.attendancePercentage.toFixed(1)}%`
      ]);
    }
    
    // Add table - positioned below report details
    autoTable(doc, {
      head: [summaryData[0]],
      body: summaryData.slice(1),
      startY: 90,
      styles: { 
        fontSize: 9,
        font: 'helvetica',
        cellPadding: 3
      },
      headStyles: { 
        fillColor: [97, 218, 251],
        textColor: [0, 0, 0],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      columnStyles: {
        0: { halign: 'left' },   // Branch Name
        1: { halign: 'center' }, // Total Employees
        2: { halign: 'center' }, // Present Days
        3: { halign: 'center' }, // Absent Days
        4: { halign: 'center' }, // Late Comings
        5: { halign: 'center' }, // Early Leaves
        6: { halign: 'center' }, // Leaves Approved
        7: { halign: 'center' }, // Overtime Hours
        8: { halign: 'center' }   // Attendance %
      }
    });
    
    // FOOTER SECTION
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Prepared by: _________________', 20, pageHeight - 30);
    doc.text('Verified by: _________________', 20, pageHeight - 20);
    doc.text(`Page 1 of 1`, 180, pageHeight - 20);
    
    return doc;
  };

  const generateDetailedReport = async (attendanceData, leaveData, branch) => {
    const doc = new jsPDF();
    
    // Set font to Calibri (fallback to Arial)
    doc.setFont('helvetica', 'normal');
    
    // HEADER SECTION
    // Company Logo
    try {
      const logoBase64 = await getLogoAsBase64();
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 20, 10, 40, 25);
      } else {
        throw new Error('Logo not found');
      }
    } catch (error) {
      // Fallback to text if logo not found
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('KHAS', 20, 25);
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text('ATTENDANCE SYSTEM', 20, 35);
    }
    
    // Report Title - positioned below logo
    doc.setFontSize(18);
    doc.setTextColor(0, 0, 0);
    doc.text('DETAILED ATTENDANCE REPORT', 20, 45);
    
    // Report Details - positioned below title
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Branch: ${branch === 'all' ? 'All Branches' : branch}`, 20, 60);
    doc.text(`Date Range: ${reportStartDate} to ${reportEndDate}`, 20, 68);
    doc.text(`Generated: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`, 20, 76);
    
    // Group data by employee for detailed view
    const employeeData = groupAttendanceByEmployee(attendanceData);
    
    let currentY = 90;
    let pageNumber = 1;
    
    // Process each employee
    Object.entries(employeeData).forEach(([empId, empInfo]) => {
      // Check if we need a new page
      if (currentY > 250) {
        doc.addPage();
        pageNumber++;
        currentY = 20;
      }
      
      // Employee Details Section
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Employee Code/ID: ${empInfo.empId}`, 20, currentY);
      currentY += 8;
      doc.text(`Employee Name: ${empInfo.name}`, 20, currentY);
      currentY += 8;
      doc.text(`Department/Designation: ${empInfo.role}`, 20, currentY);
      currentY += 8;
      doc.text(`Branch: ${empInfo.branch}`, 20, currentY);
      currentY += 15;
      
      // Daily Attendance Table
      const tableData = empInfo.attendance.map(record => {
        const checkInTime = record.checkIn ? new Date(record.checkIn.timestamp.seconds * 1000).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' }) : 'N/A';
        const checkOutTime = record.checkOut ? new Date(record.checkOut.timestamp.seconds * 1000).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' }) : 'N/A';
        const status = getAttendanceStatus(record);
        const lateMinutes = calculateLateMinutes(record.checkIn);
        const earlyMinutes = calculateEarlyMinutes(record.checkOut);
        const overtimeHours = calculateDailyOvertime(record.checkIn, record.checkOut);
        
        return [
          record.date,
          '09:00 - 18:00', // Standard shift time
          checkInTime,
          checkOutTime,
          status,
          lateMinutes > 0 ? `${lateMinutes} min` : 'No',
          earlyMinutes > 0 ? `${earlyMinutes} min` : 'No',
          overtimeHours > 0 ? `${overtimeHours}h` : '0h'
        ];
      });
      
      // Add table for this employee
      autoTable(doc, {
        head: [['Date', 'Shift Time', 'Actual Check-In', 'Actual Check-Out', 'Status', 'Late', 'Early Leave', 'Overtime']],
        body: tableData,
        startY: currentY,
        styles: { 
          fontSize: 8,
          font: 'helvetica',
          cellPadding: 2
        },
        headStyles: { 
          fillColor: [97, 218, 251],
          textColor: [0, 0, 0],
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        },
        columnStyles: {
          0: { halign: 'center' }, // Date
          1: { halign: 'center' }, // Shift Time
          2: { halign: 'center' }, // Check-In
          3: { halign: 'center' }, // Check-Out
          4: { halign: 'center' }, // Status
          5: { halign: 'center' }, // Late
          6: { halign: 'center' }, // Early Leave
          7: { halign: 'center' }   // Overtime
        }
      });
      
      currentY = doc.lastAutoTable.finalY + 20;
    });
    
    // FOOTER SECTION
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Prepared by: _________________', 20, pageHeight - 30);
    doc.text('Verified by: _________________', 20, pageHeight - 20);
    doc.text(`Page ${pageNumber} of ${pageNumber}`, 180, pageHeight - 20);
    
    return doc;
  };

  const groupAttendanceByEmployee = (attendanceData) => {
    const employeeData = {};
    
    attendanceData.forEach(record => {
      const empId = record.empId;
      
      if (!employeeData[empId]) {
        employeeData[empId] = {
          empId: empId,
          name: record.userName || 'N/A',
          role: record.role || 'N/A',
          branch: record.branch || 'N/A',
          attendance: []
        };
      }
      
      // Find existing attendance record for this date
      let attendanceRecord = employeeData[empId].attendance.find(att => att.date === record.date);
      
      if (!attendanceRecord) {
        attendanceRecord = {
          date: record.date,
          checkIn: null,
          checkOut: null
        };
        employeeData[empId].attendance.push(attendanceRecord);
      }
      
      // Add check-in or check-out
      if (record.type === 'checkin') {
        attendanceRecord.checkIn = record;
      } else if (record.type === 'checkout') {
        attendanceRecord.checkOut = record;
      }
    });
    
    // Sort attendance by date
    Object.values(employeeData).forEach(emp => {
      emp.attendance.sort((a, b) => new Date(a.date) - new Date(b.date));
    });
    
    return employeeData;
  };

  const getAttendanceStatus = (record) => {
    if (!record.checkIn) return 'Absent';
    if (record.checkIn.status === 'late') return 'Late';
    if (record.checkOut && record.checkOut.status === 'early') return 'Early Leave';
    return 'Present';
  };

  const calculateLateMinutes = (checkIn) => {
    if (!checkIn || checkIn.status !== 'late') return 0;
    
    const checkInTime = new Date(checkIn.timestamp.seconds * 1000);
    const standardTime = new Date(checkInTime);
    standardTime.setHours(9, 0, 0, 0); // 9:00 AM
    
    return Math.max(0, Math.round((checkInTime - standardTime) / (1000 * 60)));
  };

  const calculateEarlyMinutes = (checkOut) => {
    if (!checkOut || checkOut.status !== 'early') return 0;
    
    const checkOutTime = new Date(checkOut.timestamp.seconds * 1000);
    const standardTime = new Date(checkOutTime);
    standardTime.setHours(18, 0, 0, 0); // 6:00 PM
    
    return Math.max(0, Math.round((standardTime - checkOutTime) / (1000 * 60)));
  };

  const calculateDailyOvertime = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return 0;
    
    const inTime = new Date(checkIn.timestamp.seconds * 1000);
    const outTime = new Date(checkOut.timestamp.seconds * 1000);
    const hoursWorked = (outTime - inTime) / (1000 * 60 * 60);
    
    // Assuming 8 hours is standard work day
    const overtime = Math.max(0, hoursWorked - 8);
    return Math.round(overtime * 10) / 10; // Round to 1 decimal
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
      const { attendanceData, leaveData } = await fetchAttendanceData(reportStartDate, reportEndDate, selectedBranch);
      
      if (attendanceData.length === 0) {
        alert('No attendance data found for the selected criteria.');
        setGeneratingReport(false);
        return;
      }
      
      let doc;
      if (reportType === 'summary') {
        doc = await generateSummaryReport(attendanceData, leaveData, selectedBranch);
      } else {
        doc = await generateDetailedReport(attendanceData, leaveData, selectedBranch);
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

        {/* Leave Applications Section */}
        <div style={{ 
          background: 'rgba(255,255,255,0.1)', 
          padding: '1.5rem', 
          borderRadius: '12px',
          marginBottom: '1rem'
        }}>
          <h3 style={{ color: '#61dafb', marginBottom: '1rem', textAlign: 'center' }}>
            Leave Applications ({leaveApplications.filter(app => app.status === 'pending').length} Pending)
          </h3>
          
          {leaveApplications.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#61dafb', padding: '2rem' }}>
              <p>No leave applications found.</p>
            </div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {leaveApplications.map((application) => (
                <div key={application.id} style={{
                  background: 'rgba(255,255,255,0.05)',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  border: `2px solid ${
                    application.status === 'pending' ? '#ffa726' :
                    application.status === 'approved' ? '#4caf50' : '#f44336'
                  }`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <strong style={{ color: '#61dafb' }}>{application.userName}</strong>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          backgroundColor: 
                            application.status === 'pending' ? '#ffa726' :
                            application.status === 'approved' ? '#4caf50' : '#f44336',
                          color: '#fff'
                        }}>
                          {application.status.toUpperCase()}
                        </span>
                      </div>
                      
                      <div style={{ fontSize: '0.9rem', color: '#e0e7ff', marginBottom: '0.5rem' }}>
                        <div><strong>Date:</strong> {new Date(application.leaveDate).toLocaleDateString()}</div>
                        <div><strong>Type:</strong> {application.leaveType.charAt(0).toUpperCase() + application.leaveType.slice(1)} Leave</div>
                        <div><strong>Branch:</strong> {application.branch}</div>
                        <div><strong>Applied:</strong> {new Date(application.appliedAt.seconds * 1000).toLocaleDateString()}</div>
                      </div>
                      
                      <div style={{ fontSize: '0.9rem', color: '#fff', marginBottom: '0.5rem' }}>
                        <strong>Reason:</strong> {application.reason}
                      </div>
                      
                      {application.status === 'approved' && application.approvedBy && (
                        <div style={{ fontSize: '0.8rem', color: '#4caf50' }}>
                          ✅ Approved by {application.approvedBy} on {new Date(application.approvedAt.seconds * 1000).toLocaleDateString()}
                        </div>
                      )}
                      
                      {application.status === 'rejected' && application.rejectedBy && (
                        <div style={{ fontSize: '0.8rem', color: '#f44336' }}>
                          ❌ Rejected by {application.rejectedBy} on {new Date(application.rejectedAt.seconds * 1000).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    
                    {application.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                        <button 
                          className="landing-btn" 
                          onClick={() => {
                            if (window.confirm(`Approve leave for ${application.userName} on ${new Date(application.leaveDate).toLocaleDateString()}?`)) {
                              approveLeave(application.id, application.empId, application.leaveDate);
                            }
                          }}
                          style={{ 
                            minWidth: '80px', 
                            minHeight: '35px', 
                            fontSize: '0.8rem',
                            padding: '0.5rem',
                            backgroundColor: '#4caf50'
                          }}
                        >
                          ✅ Approve
                        </button>
                        <button 
                          className="landing-btn" 
                          onClick={() => {
                            if (window.confirm(`Reject leave for ${application.userName}?`)) {
                              rejectLeave(application.id);
                            }
                          }}
                          style={{ 
                            minWidth: '80px', 
                            minHeight: '35px', 
                            fontSize: '0.8rem',
                            padding: '0.5rem',
                            backgroundColor: '#f44336'
                          }}
                        >
                          ❌ Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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