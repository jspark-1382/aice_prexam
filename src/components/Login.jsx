import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { User, Shield, BookOpen, AlertTriangle } from 'lucide-react';

export default function Login({ exams, onLoginSuccess, onAdminLogin, theme, toggleTheme }) {
  const [activeTab, setActiveTab] = useState('student'); // 'student' | 'admin'
  
  // Student fields
  const [studentName, setStudentName] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Admin fields
  const [adminPassword, setAdminPassword] = useState('');
  
  // Confirmation Modal for existing attempt
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [existingUser, setExistingUser] = useState(null);
  const [existingAttempt, setExistingAttempt] = useState(null);

  useEffect(() => {
    if (exams && exams.length > 0) {
      // Set default selected exam
      setSelectedExamId(exams[0].id.toString());
    }
  }, [exams]);

  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setErrorMessage('이름을 입력해주세요.');
      return;
    }
    if (!selectedExamId) {
      setErrorMessage('시험지를 선택해주세요.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      // 1. Check if user already exists
      const { data: users, error: userError } = await supabase
        .from('User')
        .select('*')
        .eq('displayName', studentName.trim());

      if (userError) throw userError;

      if (users && users.length > 0) {
        const foundUser = users[0];
        // 2. Check if they have an active or completed attempt
        const { data: attempts, error: attemptError } = await supabase
          .from('QuizAttempt')
          .select('*, Exam(name)')
          .eq('user', foundUser.id)
          .order('id', { ascending: false });

        if (attemptError) throw attemptError;

        if (attempts && attempts.length > 0) {
          // User has existing attempts! Ask for retake confirmation
          setExistingUser(foundUser);
          setExistingAttempt(attempts[0]); // Get the latest attempt
          setShowConfirmModal(true);
          setIsLoading(false);
          return;
        } else {
          // User exists but has no attempts, proceed to create attempt
          await startNewAttempt(foundUser, parseInt(selectedExamId));
        }
      } else {
        // 3. User does not exist, create new user and start attempt
        const email = `${studentName.trim()}_${Date.now()}@aice.cbt`;
        const { data: newUser, error: createError } = await supabase
          .from('User')
          .insert([{ displayName: studentName.trim(), email }])
          .select()
          .single();

        if (createError) throw createError;
        await startNewAttempt(newUser, parseInt(selectedExamId));
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('로그인 중 오류가 발생했습니다: ' + err.message);
      setIsLoading(false);
    }
  };

  const startNewAttempt = async (userRecord, examId) => {
    try {
      // Update lastLoginAt
      await supabase
        .from('User')
        .update({ lastLoginAt: new Date().toISOString() })
        .eq('id', userRecord.id);

      // Fetch exam details to see time limits
      const selectedExam = exams.find(e => e.id === examId);
      const isPerQuestion = selectedExam?.timeMode === 'per-question';
      
      // If per-question timer, we will compute time map on client/server.
      // Insert new QuizAttempt
      const { data: newAttempt, error: attemptError } = await supabase
        .from('QuizAttempt')
        .insert([{
          user: userRecord.id,
          exam: examId,
          startedAt: new Date().toISOString(),
          timeLeft: selectedExam?.totalTimeLimit ? selectedExam.totalTimeLimit * 60 : null,
          timeLeftMapJson: isPerQuestion ? '{}' : null
        }])
        .select()
        .single();

      if (attemptError) throw attemptError;

      onLoginSuccess(userRecord, newAttempt, []);
    } catch (err) {
      console.error(err);
      setErrorMessage('시험을 시작하는 중 오류가 발생했습니다: ' + err.message);
      setIsLoading(false);
    }
  };

  const handleResumeAttempt = async () => {
    setShowConfirmModal(false);
    setIsLoading(true);
    try {
      // Update last login
      await supabase
        .from('User')
        .update({ lastLoginAt: new Date().toISOString() })
        .eq('id', existingUser.id);

      // Fetch all answers for the existing attempt
      const { data: answers, error: answersError } = await supabase
        .from('UserAnswer')
        .select('*')
        .eq('attempt', existingAttempt.id);

      if (answersError) throw answersError;

      onLoginSuccess(existingUser, existingAttempt, answers || []);
    } catch (err) {
      console.error(err);
      setErrorMessage('이전 시험을 불러오는 중 오류가 발생했습니다: ' + err.message);
      setIsLoading(false);
    }
  };

  const handleRetakeAttempt = async () => {
    setShowConfirmModal(false);
    setIsLoading(true);
    try {
      // Delete existing answers and attempts for this user
      // Note: Cascade delete is set up on references, but let's delete them explicitly or let cascade handle it.
      // In setup_tables.sql, cascade delete is configured: ON DELETE CASCADE.
      // So deleting the user's attempt will delete answers. If we delete the user, it deletes attempts too.
      // Let's delete the attempts for this user to start fresh.
      const { error: delError } = await supabase
        .from('QuizAttempt')
        .delete()
        .eq('user', existingUser.id);

      if (delError) throw delError;

      // Start fresh attempt
      await startNewAttempt(existingUser, parseInt(selectedExamId));
    } catch (err) {
      console.error(err);
      setErrorMessage('재응시 처리 중 오류가 발생했습니다: ' + err.message);
      setIsLoading(false);
    }
  };

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    if (!adminPassword) {
      setErrorMessage('비밀번호를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const { data: settings, error: settingsError } = await supabase
        .from('SystemSetting')
        .select('*')
        .eq('key', 'admin_password')
        .single();

      if (settingsError) throw settingsError;

      if (settings && settings.value === adminPassword) {
        onAdminLogin();
      } else {
        setErrorMessage('비밀번호가 올바르지 않습니다.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('관리자 로그인 중 오류가 발생했습니다: ' + err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-logo-container">
          <div className="logo-icon">A</div>
          <div className="login-logo-text">
            <h2>AICE Basic Mock Exam</h2>
            <span>컴퓨터 기반 테스트 (CBT) 시스템</span>
          </div>
        </div>

        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab-btn ${activeTab === 'student' ? 'active' : ''}`}
            onClick={() => { setActiveTab('student'); setErrorMessage(''); }}
          >
            <User size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            학생 로그인
          </button>
          <button
            type="button"
            className={`login-tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => { setActiveTab('admin'); setErrorMessage(''); }}
          >
            <Shield size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            관리자 로그인
          </button>
        </div>

        {errorMessage && (
          <div style={{
            backgroundColor: 'var(--danger-light)',
            color: 'var(--danger)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            fontWeight: '600',
            marginBottom: '1.25rem',
            textAlign: 'left'
          }}>
            {errorMessage}
          </div>
        )}

        {activeTab === 'student' ? (
          <form className="login-form" onSubmit={handleStudentSubmit}>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label htmlFor="student-name">수험자 이름</label>
              <input
                id="student-name"
                type="text"
                className="form-control"
                placeholder="이름을 입력하세요"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label htmlFor="select-exam">시험지 선택</label>
              <select
                id="select-exam"
                className="form-control"
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                disabled={isLoading}
              >
                {exams.map(exam => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name} ({exam.timeMode === 'total' ? `제한시간 ${exam.totalTimeLimit}분` : '문항별 시간 제한'})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={isLoading}
              style={{ marginTop: '1rem' }}
            >
              {isLoading ? '로딩 중...' : '시험 시작하기'}
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleAdminSubmit}>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label htmlFor="admin-password">관리자 비밀번호</label>
              <input
                id="admin-password"
                type="password"
                className="form-control"
                placeholder="비밀번호를 입력하세요"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={isLoading}
              style={{ marginTop: '1rem' }}
            >
              {isLoading ? '로딩 중...' : '관리자 모드 접속'}
            </button>
          </form>
        )}

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={toggleTheme}
            className="theme-btn"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {theme === 'dark' ? '☀️ 라이트 모드로 보기' : '🌙 다크 모드로 보기'}
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay show">
          <div className="modal">
            <div className="modal-icon" style={{ backgroundColor: 'var(--warning-light)', color: 'var(--warning)' }}>
              <AlertTriangle size={32} />
            </div>
            <h3 className="modal-title">기존 시험 이력 확인</h3>
            <p className="modal-desc" style={{ lineHeight: '1.6', textAlign: 'left' }}>
              수험자 <strong>{studentName}</strong> 님의 기존 시험 응시 이력이 있습니다.<br /><br />
              • <strong>이어서 풀기:</strong> 기존 답안과 타이머를 복원하여 이어서 시험을 진행합니다.<br />
              • <strong>재시험 응시:</strong> 기존 이력을 <strong>모두 삭제</strong>하고 {exams.find(e => e.id.toString() === selectedExamId)?.name} 시험을 처음부터 새로 시작합니다. (허용자만 시험지가 교체될 수 있습니다)
            </p>
            <div className="modal-actions" style={{ display: 'flex', gap: '1rem', width: '100%' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={handleResumeAttempt}
              >
                이어서 풀기
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, backgroundColor: 'var(--danger)' }}
                onClick={handleRetakeAttempt}
              >
                재시험 응시
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
