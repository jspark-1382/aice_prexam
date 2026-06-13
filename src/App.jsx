import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Login from './components/Login';
import ExamPanel from './components/ExamPanel';
import ResultsPanel from './components/ResultsPanel';
import AdminPanel from './components/AdminPanel';

export default function App() {
  const [view, setView] = useState('login'); // 'login' | 'exam' | 'results' | 'admin'
  const [exams, setExams] = useState([]);
  const [activeExamQuestions, setActiveExamQuestions] = useState([]);
  
  // Student Session States
  const [currentUser, setCurrentUser] = useState(null);
  const [currentAttempt, setCurrentAttempt] = useState(null);
  const [initialAnswers, setInitialAnswers] = useState([]);
  
  // Theme & Sync States
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [syncStatus, setSyncStatus] = useState('Supabase 연결 중...');

  async function fetchExams() {
    try {
      const { data, error } = await supabase
        .from('Exam')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;
      setExams(data || []);
      setSyncStatus('[동기화 완료] Supabase 실시간 DB 연동됨');
    } catch (err) {
      console.error('Error fetching exams on startup:', err);
      setSyncStatus('서버 연결 실패 (로컬 데이터 구동)');
    }
  }

  // Fetch initial exams list and check theme
  useEffect(() => {
    setTimeout(() => {
      fetchExams();
    }, 0);
    
    // Apply theme
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, [theme]);

  // Global realtime sync subscription for Exams list
  useEffect(() => {
    const examSubscription = supabase
      .channel('app_exams_sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Exam'
      }, (payload) => {
        console.log('Real-time exam update received:', payload);
        fetchExams(); // Re-fetch exams when changed
      })
      .subscribe();

    return () => {
      supabase.removeChannel(examSubscription);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  const handleLoginSuccess = async (userRecord, attemptRecord, answersRecord) => {
    setCurrentUser(userRecord);
    setCurrentAttempt(attemptRecord);
    setInitialAnswers(answersRecord);
    
    setSyncStatus('시험지 문항 다운로드 중...');
    
    try {
      // Fetch questions for this exam
      const { data: questions, error } = await supabase
        .from('QuizQuestion')
        .select('*')
        .eq('exam', attemptRecord.exam)
        .order('questionNumber', { ascending: true });

      if (error) throw error;
      setActiveExamQuestions(questions || []);

      if (attemptRecord.completedAt) {
        setView('results');
      } else {
        setView('exam');
      }
      setSyncStatus('[동기화 완료] Supabase 실시간 DB 연동됨');
    } catch (err) {
      console.error(err);
      alert('시험지 문항을 불러오는데 실패했습니다: ' + err.message);
      setSyncStatus('서버 연결 끊김');
    }
  };

  const handleAdminLogin = () => {
    setView('admin');
  };

  const handleExamSubmit = (score, correctCount, totalCount) => {
    setCurrentAttempt(prev => ({
      ...prev,
      completedAt: new Date().toISOString(),
      score,
      correctAnswersCount: correctCount,
      totalQuestions: totalCount
    }));
    setView('results');
  };

  const handleRestart = () => {
    setCurrentUser(null);
    setCurrentAttempt(null);
    setInitialAnswers([]);
    setActiveExamQuestions([]);
    setView('login');
    fetchExams();
  };

  const handleLogout = () => {
    handleRestart();
  };

  const handleExitAdmin = () => {
    setView('login');
    fetchExams();
  };

  // Main Switch View Renderer
  const renderView = () => {
    switch (view) {
      case 'login':
        return (
          <Login
            exams={exams}
            onLoginSuccess={handleLoginSuccess}
            onAdminLogin={handleAdminLogin}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        );
      case 'exam':
        return (
          <ExamPanel
            attempt={currentAttempt}
            user={currentUser}
            questions={activeExamQuestions}
            initialAnswers={initialAnswers}
            onExamSubmit={handleExamSubmit}
            onLogout={handleLogout}
          />
        );
      case 'results':
        return (
          <ResultsPanel
            attempt={currentAttempt}
            user={currentUser}
            questions={activeExamQuestions}
            onRestart={handleRestart}
          />
        );
      case 'admin':
        return (
          <AdminPanel
            onExit={handleExitAdmin}
          />
        );
      default:
        return (
          <div style={{ textAlign: 'center', marginTop: '10%' }}>
            <h2>오류가 발생했습니다.</h2>
            <button className="btn btn-primary" onClick={handleRestart}>홈으로 가기</button>
          </div>
        );
    }
  };

  return (
    <>
      {renderView()}
      
      {/* Tiny Global Sync Banner */}
      {view !== 'login' && view !== 'admin' && (
        <div style={{
          position: 'fixed',
          bottom: '10px',
          left: '10px',
          zIndex: 9999,
          fontSize: '0.75rem',
          backgroundColor: 'rgba(9, 13, 22, 0.8)',
          color: '#f1f5f9',
          padding: '0.25rem 0.5rem',
          borderRadius: '4px',
          pointerEvents: 'none',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {syncStatus}
        </div>
      )}
    </>
  );
}
