import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Clock, ChevronLeft, ChevronRight, Send, AlertCircle, HelpCircle } from 'lucide-react';

export default function ExamPanel({ 
  attempt, 
  user,
  questions, 
  initialAnswers, 
  onExamSubmit, 
  onLogout 
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // { [questionId]: answerString }
  const [timeTakenMap, setTimeTakenMap] = useState({}); // { [questionId]: seconds }
  
  // Timer States
  const [timeLeft, setTimeLeft] = useState(attempt.timeLeft || 0); // Global timer in seconds
  const [timeLeftMap, setTimeLeftMap] = useState({}); // { [questionId]: seconds }
  
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState('실시간 저장 중...');
  
  // Auto-sync intervals reference
  const syncTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const activeQuestion = questions[currentIdx] || null;

  // Initialize answers from props
  useEffect(() => {
    const ansObj = {};
    const timeTakenObj = {};
    if (initialAnswers && initialAnswers.length > 0) {
      initialAnswers.forEach(ans => {
        ansObj[ans.question] = ans.userSelectedAnswer;
        timeTakenObj[ans.question] = ans.timeTaken || 0;
      });
    }
    setAnswers(ansObj);
    setTimeTakenMap(timeTakenObj);

    // Initialize per-question timers if per-question mode
    if (attempt.timeLeftMapJson) {
      try {
        const parsed = JSON.parse(attempt.timeLeftMapJson);
        setTimeLeftMap(parsed);
      } catch (e) {
        console.error('Error parsing timeLeftMapJson:', e);
      }
    }
  }, [initialAnswers, attempt]);

  // Main countdown timer
  useEffect(() => {
    countdownTimerRef.current = setInterval(() => {
      // 1. Total Time Limit Mode
      if (attempt.Exam?.timeMode === 'total') {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      } 
      // 2. Per-Question Time Limit Mode
      else if (attempt.Exam?.timeMode === 'per-question' && activeQuestion) {
        const qId = activeQuestion.id;
        const qLimit = activeQuestion.timeLimit || 120; // default 2 mins if 0
        
        setTimeLeftMap(prevMap => {
          const currentRemaining = prevMap[qId] !== undefined ? prevMap[qId] : qLimit;
          
          if (currentRemaining <= 1) {
            // Time is up for this question! Go to next question
            const updated = { ...prevMap, [qId]: 0 };
            setTimeout(() => {
              goToNextQuestion();
            }, 100);
            return updated;
          }
          return { ...prevMap, [qId]: currentRemaining - 1 };
        });
      }

      // Track time spent on the active question
      if (activeQuestion) {
        setTimeTakenMap(prev => ({
          ...prev,
          [activeQuestion.id]: (prev[activeQuestion.id] || 0) + 1
        }));
      }
    }, 1000);

    return () => clearInterval(countdownTimerRef.current);
  }, [attempt, activeQuestion]);

  // Periodically save progress to Supabase (every 10 seconds)
  useEffect(() => {
    syncTimerRef.current = setInterval(() => {
      saveProgressToDb();
    }, 10000);

    return () => {
      clearInterval(syncTimerRef.current);
      // Final save when component unmounts
      saveProgressToDb();
    };
  }, [answers, timeLeft, timeLeftMap, timeTakenMap]);

  // Auto-save answers when user selects/inputs an answer
  const handleAnswerChange = async (questionId, value) => {
    // If per-question timer is up for this question, lock it
    const isLocked = isQuestionLocked(questionId);
    if (isLocked) return;

    const updatedAnswers = { ...answers, [questionId]: value };
    setAnswers(updatedAnswers);

    // Save this single answer immediately to Supabase
    setSyncStatus('저장 중...');
    try {
      // Verify correct
      const q = questions.find(item => item.id === questionId);
      const isCorrect = checkAnswerCorrectness(q, value);

      // Check if UserAnswer row already exists
      const { data: existing, error: queryError } = await supabase
        .from('UserAnswer')
        .select('id')
        .eq('attempt', attempt.id)
        .eq('question', questionId);

      if (queryError) throw queryError;

      if (existing && existing.length > 0) {
        // Update
        const { error: updateError } = await supabase
          .from('UserAnswer')
          .update({
            userSelectedAnswer: value,
            isCorrect: isCorrect,
            timeTaken: timeTakenMap[questionId] || 0
          })
          .eq('id', existing[0].id);

        if (updateError) throw updateError;
      } else {
        // Insert
        const { error: insertError } = await supabase
          .from('UserAnswer')
          .insert([{
            attempt: attempt.id,
            question: questionId,
            userSelectedAnswer: value,
            isCorrect: isCorrect,
            timeTaken: timeTakenMap[questionId] || 0
          }]);

        if (insertError) throw insertError;
      }
      setSyncStatus('실시간 동기화 완료');
    } catch (e) {
      console.error('Auto-save answer error:', e);
      setSyncStatus('저장 실패 (재시도 중)');
    }
  };

  const checkAnswerCorrectness = (questionObj, val) => {
    if (!questionObj || val === undefined || val === '') return false;
    
    if (questionObj.type === 'multiple-choice') {
      return parseInt(val) === questionObj.correctAnswerIndex;
    } else if (questionObj.type === 'short-answer') {
      const sanitizedUser = val.replace(/\s+/g, '').toLowerCase();
      // correctAnswers is text[]
      return questionObj.correctAnswers.some(ans => 
        ans.replace(/\s+/g, '').toLowerCase() === sanitizedUser
      );
    }
    return false;
  };

  const isQuestionLocked = (qId) => {
    if (attempt.Exam?.timeMode !== 'per-question') return false;
    return timeLeftMap[qId] === 0;
  };

  const saveProgressToDb = async () => {
    try {
      const updateData = {};
      if (attempt.Exam?.timeMode === 'total') {
        updateData.timeLeft = timeLeft;
      } else if (attempt.Exam?.timeMode === 'per-question') {
        updateData.timeLeftMapJson = JSON.stringify(timeLeftMap);
      }

      const { error } = await supabase
        .from('QuizAttempt')
        .update(updateData)
        .eq('id', attempt.id);

      if (error) throw error;
      setSyncStatus('실시간 동기화 완료');
    } catch (e) {
      console.error('Periodic sync error:', e);
    }
  };

  const handleAutoSubmit = () => {
    setSyncStatus('제한시간 종료. 제출 중...');
    submitExamFinal();
  };

  const handleSubmitClick = () => {
    setShowSubmitModal(true);
  };

  const submitExamFinal = async () => {
    setShowSubmitModal(false);
    clearInterval(countdownTimerRef.current);
    clearInterval(syncTimerRef.current);

    setSyncStatus('성적 처리 중...');

    try {
      // 1. Fetch final answers from Supabase to guarantee correctness
      const { data: finalAnswers, error: ansError } = await supabase
        .from('UserAnswer')
        .select('*')
        .eq('attempt', attempt.id);

      if (ansError) throw ansError;

      // 2. Grade the attempt
      let correctCount = 0;
      const totalQuestionsCount = questions.length;

      questions.forEach(q => {
        const userAns = finalAnswers?.find(fa => fa.question === q.id);
        if (userAns && userAns.isCorrect) {
          correctCount++;
        }
      });

      const finalScore = Math.round((correctCount / totalQuestionsCount) * 100);

      // 3. Update QuizAttempt as completed
      const { error: attemptError } = await supabase
        .from('QuizAttempt')
        .update({
          completedAt: new Date().toISOString(),
          score: finalScore,
          totalQuestions: totalQuestionsCount,
          correctAnswersCount: correctCount,
          timeLeft: attempt.Exam?.timeMode === 'total' ? timeLeft : null,
          timeLeftMapJson: attempt.Exam?.timeMode === 'per-question' ? JSON.stringify(timeLeftMap) : null
        })
        .eq('id', attempt.id);

      if (attemptError) throw attemptError;

      setSyncStatus('제출 성공');
      
      // Notify parent
      onExamSubmit(finalScore, correctCount, totalQuestionsCount);
    } catch (e) {
      console.error('Submit exam error:', e);
      alert('제출 처리 중 오류가 발생했습니다: ' + e.message);
    }
  };

  const goToNextQuestion = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    }
  };

  const goToPrevQuestion = () => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
  };

  // Mini custom markdown renderer
  const renderContext = (text) => {
    if (!text) return null;
    
    // Convert newlines to breaks or paragraphs
    const lines = text.split('\n');
    return (
      <div className="markdown-desc-box">
        {lines.map((line, i) => {
          // Check for bullet points
          const isBullet = line.trim().startsWith('*') || line.trim().startsWith('-');
          const cleanLine = isBullet ? line.trim().substring(1).trim() : line;
          
          // Render inline code backticks `code`
          const parts = cleanLine.split(/(`[^`]+`)/g);
          const parsedContent = parts.map((part, idx) => {
            if (part.startsWith('`') && part.endsWith('`')) {
              return <code key={idx}>{part.slice(1, -1)}</code>;
            }
            return part;
          });

          if (isBullet) {
            return (
              <div key={i} className="md-item">
                {parsedContent}
              </div>
            );
          } else {
            return (
              <p key={i} className="md-para">
                {parsedContent}
              </p>
            );
          }
        })}
      </div>
    );
  };

  // Calculate progress stats
  const answeredCount = Object.keys(answers).filter(k => answers[k] !== undefined && answers[k] !== '').length;
  const progressPercent = (answeredCount / questions.length) * 100;

  // Format timer text
  const formatTime = (secs) => {
    if (secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Active question timer details
  const getQuestionTimerInfo = () => {
    if (!activeQuestion) return { label: '', time: 0, percent: 100, isWarning: false };
    
    const limit = activeQuestion.timeLimit || 120;
    const remaining = timeLeftMap[activeQuestion.id] !== undefined ? timeLeftMap[activeQuestion.id] : limit;
    const pct = (remaining / limit) * 100;
    
    return {
      label: `문항 ${activeQuestion.questionNumber} 타이머`,
      time: formatTime(remaining),
      percent: pct,
      isWarning: remaining <= 20
    };
  };

  const getGlobalTimerInfo = () => {
    const limit = (attempt.Exam?.totalTimeLimit || 30) * 60;
    const pct = (timeLeft / limit) * 100;
    return {
      label: '시험 잔여 시간',
      time: formatTime(timeLeft),
      percent: pct,
      isWarning: timeLeft <= 180 // 3 minutes warning
    };
  };

  const timerInfo = attempt.Exam?.timeMode === 'per-question' ? getQuestionTimerInfo() : getGlobalTimerInfo();
  const activeLocked = activeQuestion ? isQuestionLocked(activeQuestion.id) : false;

  return (
    <>
      {/* Header Info */}
      <header>
        <div className="header-container">
          <div className="header-left">
            <div className="logo-icon">A</div>
            <div className="logo-text">
              <h1>AICE Basic 모의고사</h1>
              <span>수험자: {user.displayName}</span>
            </div>
          </div>
          <div className="header-right">
            <div className="progress-header">
              <span className="progress-text">답안 작성 진행률 ({answeredCount}/{questions.length})</span>
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={onLogout} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Grid */}
      <main className="main-layout">
        {/* Left Side Quiz Screen */}
        <section className="quiz-section">
          {/* Timer Bar */}
          {(attempt.Exam?.timeMode === 'total' || attempt.Exam?.timeMode === 'per-question') && (
            <div className="timer-container">
              <div className="timer-icon">
                <Clock size={18} color={timerInfo.isWarning ? 'var(--danger)' : 'var(--text-muted)'} />
              </div>
              <div className="timer-bar-bg">
                <div 
                  className={`timer-bar-fill ${timerInfo.isWarning ? 'warning' : ''}`}
                  style={{ width: `${timerInfo.percent}%` }}
                ></div>
              </div>
              <span className="timer-countdown" style={{ color: timerInfo.isWarning ? 'var(--danger)' : 'inherit' }}>
                {timerInfo.time}
              </span>
            </div>
          )}

          {activeQuestion && (
            <div className="card">
              {activeLocked && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(9, 13, 22, 0.4)',
                  backdropFilter: 'blur(2px)',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  color: 'white',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <AlertCircle size={48} color="var(--danger)" />
                  <h3 style={{ marginTop: '1rem', fontSize: '1.25rem' }}>제한시간 종료로 인해 본 문항은 잠겼습니다.</h3>
                  <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>다음 문항을 진행해 주세요.</p>
                </div>
              )}

              {/* Context Box */}
              {activeQuestion.reference && renderContext(activeQuestion.reference)}

              {/* Question Title */}
              <div className="question-title-container">
                <div className="question-number">Q{activeQuestion.questionNumber}</div>
                <div className="question-text">{activeQuestion.questionText}</div>
              </div>

              {/* Option List or Text input */}
              {activeQuestion.type === 'multiple-choice' ? (
                <div className="options-list">
                  {activeQuestion.options.map((option, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`option-item ${answers[activeQuestion.id] === idx.toString() ? 'selected' : ''}`}
                      onClick={() => handleAnswerChange(activeQuestion.id, idx.toString())}
                      disabled={activeLocked}
                    >
                      <div className="option-radio"></div>
                      <span>{option}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="short-answer-container">
                  <input
                    type="text"
                    className="text-input"
                    placeholder={activeQuestion.placeholder || '답안을 입력하세요...'}
                    value={answers[activeQuestion.id] || ''}
                    onChange={(e) => handleAnswerChange(activeQuestion.id, e.target.value)}
                    disabled={activeLocked}
                  />
                  <span className="field-desc" style={{ marginTop: '0.5rem', display: 'block' }}>
                    입력 후 빈 공간을 누르면 실시간 동기화가 진행됩니다. (대소문자, 띄어쓰기 가리지 않고 정답 판정 지원)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Navigation Prev/Next Buttons */}
          <div className="nav-buttons">
            <button 
              className="btn btn-secondary"
              onClick={goToPrevQuestion}
              disabled={currentIdx === 0}
            >
              <ChevronLeft size={16} /> 이전 문항
            </button>
            <button 
              className="btn btn-secondary"
              onClick={goToNextQuestion}
              disabled={currentIdx === questions.length - 1}
            >
              다음 문항 <ChevronRight size={16} />
            </button>
          </div>
        </section>

        {/* Right Side Sidebar Grid */}
        <section className="sidebar">
          <div className="sidebar-card">
            <div className="sidebar-title">
              <span>문항 네비게이션</span>
              <span className="sidebar-stats">완료 {answeredCount}/{questions.length}</span>
            </div>

            <div className="question-grid">
              {questions.map((q, idx) => {
                const isAnswered = answers[q.id] !== undefined && answers[q.id] !== '';
                const isActive = idx === currentIdx;
                const isLocked = timeLeftMap[q.id] === 0;

                return (
                  <button
                    key={q.id}
                    className={`grid-item 
                      ${isActive ? 'active' : ''} 
                      ${isAnswered ? 'answered' : ''} 
                      ${isLocked ? 'no-answer' : ''}
                    `}
                    onClick={() => setCurrentIdx(idx)}
                    title={`문항 ${q.questionNumber}`}
                  >
                    {q.questionNumber}
                  </button>
                );
              })}
            </div>

            <div className="submit-box">
              <button 
                className="btn btn-success btn-full"
                onClick={handleSubmitClick}
              >
                <Send size={16} /> 시험 제출하기
              </button>
            </div>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', textAlign: 'center' }}>
            🔄 {syncStatus}
          </div>
        </section>
      </main>

      {/* Confirmation Submit Modal */}
      {showSubmitModal && (
        <div className="modal-overlay show">
          <div className="modal">
            <div className="modal-icon" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
              <HelpCircle size={32} />
            </div>
            <h3 className="modal-title">시험 답안 제출</h3>
            <p className="modal-desc">
              정말로 시험 답안을 제출하시겠습니까?<br />
              제출 이후에는 답안을 수정하거나 다시 응시할 수 없습니다.<br /><br />
              • 총 문항: {questions.length}개<br />
              • 작성 완료: {answeredCount}개<br />
              • 미작성 문항: {questions.length - answeredCount}개
            </p>
            <div className="modal-actions">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowSubmitModal(false)}
              >
                돌아가기
              </button>
              <button 
                className="btn btn-primary"
                onClick={submitExamFinal}
              >
                제출 완료
              </button>
            </div>
          </div>
        </div>
      )}

      <footer>
        <div className="footer-container">
          <p>© 2026 AICE Basic 모의고사. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
