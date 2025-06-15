import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import type { Auth, User } from 'firebase/auth'; // Corrected syntax here
// Suppress unused warnings for orderBy and limit, as they are imported for context but not used in current queries
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, serverTimestamp, where, getDocs, orderBy, limit } from 'firebase/firestore';
import type { Firestore, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore'; // Corrected syntax here

// Global variables provided by the environment
// For local development, REPLACE THESE WITH YOUR ACTUAL FIREBASE CONFIGURATION.
// You can find these details in your Firebase Console under Project settings -> "Your apps"

const appId = 'study-hub-local-dev'; // Keep this as 'study-hub-local-dev' or any other unique string you prefer
const firebaseConfig = {
  apiKey: "AIzaSyB6dgPHp-A6q87I1-Z7ryVsxD12Hpb_BGQ",
  authDomain: "studyhubapp-642ed.firebaseapp.com",
  projectId: "studyhubapp-642ed",
  storageBucket: "studyhubapp-642ed.firebasestorage.app",
  messagingSenderId: "253493180142",
  appId: "1:253493180142:web:5ed525c3def1a90644a5ff",
  measurementId: "G-RVXVNFWK93" // Include this as it was in your provided config
};
const initialAuthToken: string | null = null;

// Define interfaces for your data structures
interface StudyUser {
  id: string;
  username: string;
}

interface UserSession {
  id: string; // Firestore document ID for the session (made non-optional as we always derive it)
  userId: string;
  username: string;
  loginTime: Timestamp; // Firebase Timestamp type
  isLoggedIn: boolean;
  logoutTime: Timestamp | null;
  currentTime?: Date; // For real-time display, not stored in Firestore
}

interface PaymentDetails {
  username: string;
  duration: string;
  totalPayment: number;
}


function App() {
  const [db, setDb] = useState<Firestore | null>(null);
  // Suppress 'auth' unused warning since it's set but not directly read in JSX or other functions
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [auth, setAuth] = useState<Auth | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

  const [allUsers, setAllUsers] = useState<StudyUser[]>([]);
  const [activeSessions, setActiveSessions] = useState<UserSession[]>([]);

  const [newUserName, setNewUserName] = useState<string>('');
  const [userToRemoveId, setUserToRemoveId] = useState<string>('');

  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);

  const [message, setMessage] = useState<string>('');

  const [showConfirmRemoveAllModal, setShowConfirmRemoveAllModal] = useState<boolean>(false);

  const intervalRefs = useRef<Record<string, number>>({});

  // 1. Initialize Firebase and authenticate
  useEffect(() => {
    let app: FirebaseApp;
    let authInstance: Auth;
    let dbInstance: Firestore;

    try {
      if (firebaseConfig.apiKey === "YOUR_FIREBASE_API_KEY" || firebaseConfig.apiKey === "") {
        const errorMessage = "Firebase API Key is missing or invalid. Please replace 'YOUR_FIREBASE_API_KEY' and other Firebase config placeholders with your actual project details from the Firebase Console (Project settings -> Your apps).";
        console.error("Firebase Initialization Error:", errorMessage);
        setMessage(`Error: ${errorMessage}`);
        console.log("Current firebaseConfig:", firebaseConfig);
        return;
      }

      app = initializeApp(firebaseConfig);
      authInstance = getAuth(app);
      dbInstance = getFirestore(app);

      setAuth(authInstance);
      setDb(dbInstance);

      const unsubscribeAuth = onAuthStateChanged(authInstance, async (user: User | null) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
          setMessage(`Admin User ID: ${user.uid}`);
        } else {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(authInstance, initialAuthToken);
            } else {
              await signInAnonymously(authInstance);
            }
          } catch (error: any) {
            console.error("Firebase Auth Error:", error);
            setMessage(`Authentication failed: ${error.message}`);
          }
        }
      });

      return () => {
        unsubscribeAuth();
        Object.values(intervalRefs.current).forEach(clearInterval);
      };
    } catch (error: any) {
      console.error("Failed to initialize Firebase:", error);
      setMessage(`Firebase initialization failed: ${error.message}`);
    }
  }, []);

  // 2. Listen for 'users' collection changes (registered study hub users)
  useEffect(() => {
    if (!db || !userId || !isAuthReady) return;

    const usersCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/users`);
    const unsubscribeUsers = onSnapshot(usersCollectionRef, (snapshot) => {
      const usersData: StudyUser[] = snapshot.docs.map((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        return {
          id: doc.id,
          username: data.username,
        } as StudyUser;
      });
      setAllUsers(usersData);
    }, (error: any) => {
      console.error("Error fetching users:", error);
      setMessage(`Error loading users: ${error.message}`);
    });

    return () => unsubscribeUsers();
  }, [db, userId, isAuthReady]);

  // 3. Listen for 'sessions' collection changes (active logins)
  useEffect(() => {
    if (!db || !userId || !isAuthReady) return;

    const sessionsCollectionRef = collection(db, `artifacts/${appId}/public/data/sessions`);
    const q = query(sessionsCollectionRef, where("isLoggedIn", "==", true));

    const unsubscribeSessions = onSnapshot(q, (snapshot) => {
      const sessionsData: UserSession[] = snapshot.docs.map((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        const session: UserSession = {
          id: doc.id,
          userId: data.userId,
          username: data.username,
          loginTime: data.loginTime,
          isLoggedIn: data.isLoggedIn,
          logoutTime: data.logoutTime,
          ...(data.currentTime && { currentTime: data.currentTime })
        };
        return session;
      });
      setActiveSessions(sessionsData);
    }, (error: any) => {
      console.error("Error fetching active sessions:", error);
      setMessage(`Error loading active sessions: ${error.message}`);
    });

    return () => unsubscribeSessions();
  }, [db, userId, isAuthReady]);

  // 4. Real-time duration update for active sessions
  useEffect(() => {
    Object.values(intervalRefs.current).forEach((intervalId: number) => clearInterval(intervalId));
    intervalRefs.current = {};

    activeSessions.forEach(session => {
      if (session.loginTime && session.isLoggedIn) {
        const intervalId: number = window.setInterval(() => {
          setActiveSessions(prevSessions =>
            prevSessions.map(s =>
              s.id === session.id ? { ...s, currentTime: new Date() } : s
            )
          );
        }, 1000);
        intervalRefs.current[session.id] = intervalId;
      }
    });

    return () => {
      Object.values(intervalRefs.current).forEach((intervalId: number) => clearInterval(intervalId));
    };
  }, [activeSessions]);


  // Helper to calculate duration and payment based on tiered pricing
  const calculateDurationAndPayment = (loginTimestamp: Timestamp, logoutTimestampOrCurrentTime: Timestamp | Date) => {
    if (!loginTimestamp || !logoutTimestampOrCurrentTime) {
      return { durationMs: 0, hours: 0, totalPayment: 0 };
    }

    const loginTime = loginTimestamp.toDate();
    const endTime = logoutTimestampOrCurrentTime instanceof Date ? logoutTimestampOrCurrentTime : logoutTimestampOrCurrentTime.toDate();
    const durationMs = endTime.getTime() - loginTime.getTime();
    const durationHoursCalculated = durationMs / (1000 * 60 * 60); // Total hours including fractions

    let totalPayment = 0;
    const rateFirstTwoHours = 30; // ₱30 per hour for the first two hours
    const rateSucceedingHours = 20; // ₱20 per hour for succeeding hours
    const firstTwoHoursThreshold = 2; // In hours

    if (durationHoursCalculated <= firstTwoHoursThreshold) {
      // If duration is 2 hours or less, apply the first rate
      totalPayment = durationHoursCalculated * rateFirstTwoHours;
    } else {
      // Calculate payment for the first two hours
      totalPayment += firstTwoHoursThreshold * rateFirstTwoHours;
      // Calculate payment for succeeding hours
      const succeedingHours = durationHoursCalculated - firstTwoHoursThreshold;
      totalPayment += succeedingHours * rateSucceedingHours;
    }

    return { durationMs, hours: durationHoursCalculated, totalPayment };
  };

  const handleAddUser = async () => {
    if (!newUserName.trim() || !db || !userId) {
      setMessage('Please enter a username.');
      return;
    }
    try {
      const usersCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/users`);
      const q = query(usersCollectionRef, where("username", "==", newUserName.trim()));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setMessage(`User '${newUserName}' already exists.`);
        return;
      }

      await addDoc(usersCollectionRef, { username: newUserName.trim() });
      setNewUserName('');
      setMessage(`User '${newUserName}' added successfully!`);
    } catch (error: any) {
      console.error("Error adding document: ", error);
      setMessage(`Error adding user: ${error.message}`);
    }
  };

  const handleRemoveUser = async () => {
    if (!userToRemoveId || !db || !userId) {
      setMessage('Please select a user to remove.');
      return;
    }
    try {
      const usersCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/users`);
      await deleteDoc(doc(usersCollectionRef, userToRemoveId));

      const sessionsCollectionRef = collection(db, `artifacts/${appId}/public/data/sessions`);
      const q = query(sessionsCollectionRef, where("userId", "==", userToRemoveId), where("isLoggedIn", "==", true));
      const snapshot = await getDocs(q);
      snapshot.forEach(async (sessionDoc) => {
        await updateDoc(sessionDoc.ref, {
          isLoggedIn: false,
          logoutTime: serverTimestamp()
        });
      });

      setUserToRemoveId('');
      setMessage('User removed successfully!');
    } catch (error: any) {
      console.error("Error removing user: ", error);
      setMessage(`Error removing user: ${error.message}`);
    }
  };

  const handleRemoveAllUsers = async () => {
    if (!db || !userId) {
      setMessage('Database not ready.');
      return;
    }
    setShowConfirmRemoveAllModal(false);

    try {
      const usersCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/users`);
      const usersSnapshot = await getDocs(usersCollectionRef);
      const userDeletionPromises = usersSnapshot.docs.map((d: QueryDocumentSnapshot) => deleteDoc(doc(usersCollectionRef, d.id)));
      await Promise.all(userDeletionPromises);

      const sessionsCollectionRef = collection(db, `artifacts/${appId}/public/data/sessions`);
      const activeSessionsQuery = query(sessionsCollectionRef, where("isLoggedIn", "==", true));
      const activeSessionsSnapshot = await getDocs(activeSessionsQuery);
      const sessionUpdatePromises = activeSessionsSnapshot.docs.map((s: QueryDocumentSnapshot) => updateDoc(doc(sessionsCollectionRef, s.id), {
        isLoggedIn: false,
        logoutTime: serverTimestamp()
      }));
      await Promise.all(sessionUpdatePromises);

      setMessage('All users and active sessions removed successfully!');
    } catch (error: any) {
      console.error("Error removing all users: ", error);
      setMessage(`Error removing all users: ${error.message}`);
    }
  };

  const handleLogin = async (user: StudyUser) => {
    if (!db) return;

    try {
      // 1. Check if user is already logged in (active session)
      const existingActiveSession = activeSessions.find(session => session.userId === user.id && session.isLoggedIn);
      if (existingActiveSession) {
        setMessage(`${user.username} is already logged in.`);
        return;
      }

      const sessionsCollectionRef = collection(db, `artifacts/${appId}/public/data/sessions`);

      // 2. Always create a new session when "Login" is clicked
      await addDoc(sessionsCollectionRef, {
        userId: user.id,
        username: user.username,
        loginTime: serverTimestamp(), // New login time for a fresh session segment
        isLoggedIn: true,
        logoutTime: null,
      } as UserSession);
      setMessage(`${user.username} logged in.`);
    } catch (error: any) {
      console.error("Error logging in: ", error);
      setMessage(`Error logging in ${user.username}: ${error.message}`);
    }
  };

  const handleLogout = async (session: UserSession) => {
    if (!db || !session.id) return;
    try {
      const sessionDocRef = doc(db, `artifacts/${appId}/public/data/sessions`, session.id);
      await updateDoc(sessionDocRef, {
        isLoggedIn: false,
        logoutTime: serverTimestamp()
      });

      const currentLoginTime = session.loginTime;
      const currentLogoutTime = new Date();
      const { durationMs, totalPayment } = calculateDurationAndPayment(currentLoginTime, currentLogoutTime);

      setPaymentDetails({
        username: session.username,
        duration: `${Math.floor(durationMs / (1000 * 60 * 60))}h ${Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))}m ${Math.floor((durationMs % (1000 * 60)) / 1000)}s`,
        // Round the total payment to two decimal places for display
        totalPayment: parseFloat(totalPayment.toFixed(2)),
      });
      setShowPaymentModal(true);
      setMessage(`${session.username} logged out.`);

    } catch (error: any) {
      console.error("Error logging out: ", error);
      setMessage(`Error logging out ${session.username}: ${error.message}`);
    }
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setPaymentDetails(null);
  };

  if (!isAuthReady) {
    return (
      <div className="loading-screen">
        <div className="loading-text">Loading Study Hub App...</div>
      </div>
    );
  }

  const displayUsers = allUsers.map(user => {
    const activeSession = activeSessions.find(session => session.userId === user.id);
    let currentPayment = 0;
    let currentDurationString = '0h 0m 0s';

    if (activeSession && activeSession.loginTime) {
      const loginDate = activeSession.loginTime.toDate();
      const currentDisplayedTime = activeSession.currentTime || new Date();
      const diffMs = currentDisplayedTime.getTime() - loginDate.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      currentDurationString = `${hours}h ${minutes}m ${seconds}s`;

      const durationHours = diffMs / (1000 * 60 * 60);
      // Calculate current payment using the tiered pricing logic
      currentPayment = parseFloat(calculateDurationAndPayment(activeSession.loginTime, currentDisplayedTime).totalPayment.toFixed(2));
    }

    return {
      ...user,
      isLoggedIn: !!activeSession,
      session: activeSession,
      currentDurationString: currentDurationString,
      currentPayment: currentPayment
    };
  });

  return (
    <div className="app-container">
      {/* Top Section: Titles and Logo */}
      <header className="app-header">
        {/* The 'Logo' image/text was removed from here. It was part of a placeholder image. */}
        <h1 className="header-title">STUDY HUB TRACKER</h1>
        <h2 className="header-subtitle">USER LOG</h2>
        <div className="cafe-logo">
          <p className="cafe-logo-main">CAFÉ NAHUM</p>
          <p className="cafe-logo-sub">beans . bkes . books</p>
        </div>
      </header>

      <div className="main-content-wrapper">
        {/* Admin Panel */}
        <aside className="admin-panel">
          <h2 className="admin-panel-title">Admin Panel</h2>

          <div className="admin-id-display">
            **Admin ID:** <span className="admin-id-span">{userId}</span>
          </div>

          {message && (
            <div className={`message-box ${message.includes('Error') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}

          {/* Add New User Section */}
          <div className="admin-section-block">
            <h3>Add New User</h3>
            <input
              type="text"
              placeholder="Enter username"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              className="admin-input"
            />
            <button
              onClick={handleAddUser}
              className="admin-button"
            >
              Add User
            </button>
          </div>

          {/* Divider */}
          <div className="admin-divider"></div>

          {/* Remove User Section */}
          <div className="admin-section-block">
            <h3>Remove User</h3>
            <select
              value={userToRemoveId}
              onChange={(e) => setUserToRemoveId(e.target.value)}
              className="admin-select"
            >
              <option value="">Select User to Remove</option>
              {allUsers.map(user => (
                <option key={user.id} value={user.id}>{user.username}</option>
              ))}
            </select>
            <button
              onClick={handleRemoveUser}
              className="admin-button"
            >
              Remove Selected User
            </button>
          </div>

          {/* Divider */}
          <div className="admin-divider"></div>

          {/* Remove All Users Section */}
          <div className="admin-section-block">
            <h3>Remove All Users</h3>
            <button
              onClick={() => setShowConfirmRemoveAllModal(true)}
              className="admin-button"
            >
              Remove All Users
            </button>
          </div>
        </aside>

        {/* Main Content Area: User Login/Logout Status */}
        <main className="user-log-main">
          {displayUsers.length === 0 ? (
            <p className="no-users-message">No users registered yet. Add a user from the Admin Panel.</p>
          ) : (
            <div className="user-cards-grid">
              {displayUsers.map(user => (
                <div key={user.id} className="user-card">
                  <h3>{user.username}</h3>
                  {user.isLoggedIn ? (
                    <div className="user-card-content-active">
                      <span className="user-status-logged-in">
                        <span className="status-dot"></span>
                        Logged In
                      </span>
                      <p className="user-detail-text">
                        Login Time: {user.session?.loginTime ? new Date(user.session.loginTime.seconds * 1000).toLocaleTimeString() : 'N/A'}
                      </p>
                      <p className="user-detail-text">
                        Duration: {user.currentDurationString}
                      </p>
                      <p className="user-detail-amount">
                        Current Amount: ₱{user.currentPayment.toFixed(2)} {/* Display with 2 decimal places */}
                      </p>
                      <button
                        onClick={() => user.session && handleLogout(user.session)}
                        className="card-button logout"
                      >
                        Logout
                      </button>
                    </div>
                  ) : (
                    <div className="user-card-content-inactive">
                      <span className="user-status-logged-out">
                        Logged Out
                      </span>
                      <p className="user-detail-text">
                        Last Logout: {user.session?.logoutTime ? new Date(user.session.logoutTime.seconds * 1000).toLocaleTimeString() : 'N/A'}
                      </p>
                      <div className="card-buttons-group">
                        <button
                          onClick={() => handleLogin(user)}
                          className="card-button login"
                        >
                          Login
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && paymentDetails && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Payment Summary</h2>
            <p className="modal-text">User: <span className="font-semibold">{paymentDetails.username}</span></p>
            <p className="modal-text">Total Duration: <span className="font-semibold">{paymentDetails.duration}</span></p>
            <p className="modal-payment-amount">Total Payment: ₱{paymentDetails.totalPayment.toFixed(2)}</p> {/* Display with 2 decimal places */}
            <button
              onClick={closePaymentModal}
              className="modal-button"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Remove All Users */}
      {showConfirmRemoveAllModal && (
        <div className="modal-overlay">
          <div className="modal-content confirmation-modal-content">
            <h2>Confirm Removal</h2>
            <p className="modal-text">
              Are you sure you want to remove ALL users and clear all active sessions? This action cannot be undone.
            </p>
            <div className="confirmation-modal-buttons">
              <button
                onClick={() => setShowConfirmRemoveAllModal(false)}
                className="confirmation-button-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveAllUsers}
                className="confirmation-button-confirm"
              >
                Confirm Remove All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
