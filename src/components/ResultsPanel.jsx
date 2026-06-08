import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Check, X, ChevronDown, Award, RefreshCw, AlertCircle } from 'lucide-react';

export default function ResultsPanel({ 
  attempt, 
  user,
  questions, 
  onRestart 
}) {
  const [answers, setAnswers] = useState([]);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'incorrect'
  const [expandedItems, setExpandedItems] = useState({}); // { [questionId]: boolean }
  const [strokeOffset, setStrokeOffset] = useState(439.8); // Circumference for r=70 (2 * pi * 70 = 439.82)
  const [isLoading, setIsLoading] = useState(true);

  const score = (attempt && attempt.score !== null && attempt.score !== undefined) ? attempt.score : 0;
  const isPass = score >= 60; // Standard passing score is 60

  useEffect(() => {
    // Fetch final answers from Supabase for this attempt
    const fetchAnswers = async () => {
      try {
        const { data, error } = await supabase
          .from('UserAnswer')
          .select('*')
          .eq('attempt', attempt.id);

        if (error) throw error;
        setAnswers(data || []);
      } catch (err) {
        console.error('Error fetching answers for results:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnswers();

    // Trigger gauge animation
    const circumference = 2 * Math.PI * 70;
    const offset = circumference - (score / 100) * circumference;
    const timer = setTimeout(() => {
      setStrokeOffset(offset);
    }, 100);

    return () => clearTimeout(timer);
  }, [attempt, score]);

  const toggleExpand = (qId) => {
    setExpandedItems(prev => ({
      ...prev,
      [qId]: !prev[qId]
    }));
  };

  const getQuestionUserAnswer = (qId) => {
    return answers.find(a => a.question === qId);
  };

  const filteredQuestions = questions.filter(q => {
    if (filterMode === 'all') return true;
    const userAns = getQuestionUserAnswer(q.id);
    return !userAns || !userAns.isCorrect;
  });

  const getOptionLetter = (idx) => {
    return (idx + 1).toString(); // Return '1', '2', '3', '4'
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <RefreshCw className="animate-spin" size={36} color="var(--primary)" />
        <p>결과 화면을 구성하는 중입니다...</p>
      </div>
    );
  }

  return (
    <>
      <header>
        <div className="header-container">
          <div className="header-left">
            <div className="logo-icon">A</div>
            <div className="logo-text">
              <h1>AICE Basic Mock CBT</h1>
              <span>수험 결과</span>
            </div>
          </div>
          <div className="header-right">
            <button type="button" className="btn btn-secondary" onClick={onRestart} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              홈으로 가기
            </button>
          </div>
        </div>
      </header>

      <div className="results-container">
        {/* Header Summary Card */}
        <div className="results-header-card animate-fade-in">
          <div className="score-circle-container">
            <svg width="180" height="180" className="score-ring">
              <circle
                className="score-ring-bg"
                cx="90"
                cy="90"
                r="70"
              />
              <circle
                className="score-ring-progress"
                cx="90"
                cy="90"
                r="70"
                strokeDasharray="439.8"
                strokeDashoffset={strokeOffset}
              />
            </svg>
            <div className="score-text-overlay">
              <div className="score-number">{score}</div>
              <div className="score-total">점</div>
            </div>
          </div>

          <div className={`result-badge ${isPass ? 'pass' : 'fail'}`}>
            {isPass ? '합격 (PASS)' : '불합격 (FAIL)'}
          </div>
          
          <h2 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.5rem' }}>
            {user.displayName} 님의 성적 분석 결과
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            본 모의고사는 AICE Basic 유형에 맞추어 출제되었습니다. 오답 분석을 통하여 부족한 개념을 보충해 보세요.
          </p>

          <div className="results-stats-row">
            <div className="stat-item">
              <div className="stat-val">{questions.length}</div>
              <div className="stat-lbl">총 문항 수</div>
            </div>
            <div className="stat-item">
              <div className="stat-val success">{attempt.correctAnswersCount}</div>
              <div className="stat-lbl">정답 문항</div>
            </div>
            <div className="stat-item">
              <div className="stat-val danger">{questions.length - attempt.correctAnswersCount}</div>
              <div className="stat-lbl">오답 문항</div>
            </div>
          </div>
        </div>

        {/* Filter controls */}
        <div className="review-bar">
          <div className="review-title">상세 문제 분석</div>
          <div className="filter-group">
            <button
              className={`filter-btn ${filterMode === 'all' ? 'active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              전체 보기
            </button>
            <button
              className={`filter-btn ${filterMode === 'incorrect' ? 'active' : ''}`}
              onClick={() => setFilterMode('incorrect')}
            >
              오답만 보기
            </button>
          </div>
        </div>

        {/* Collapsible Accordion Review List */}
        <div className="review-list">
          {filteredQuestions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}>
              오답이 존재하지 않습니다. 아주 훌륭합니다!
            </div>
          ) : (
            filteredQuestions.map((q, idx) => {
              const userAns = getQuestionUserAnswer(q.id);
              const isCorrect = userAns ? userAns.isCorrect : false;
              const isExpanded = !!expandedItems[q.id];

              // Format answer labels
              let userAnsText = '미입력';
              let correctAnsText = '';

              if (q.type === 'multiple-choice') {
                if (userAns && userAns.userSelectedAnswer !== undefined && userAns.userSelectedAnswer !== '') {
                  const uIdx = parseInt(userAns.userSelectedAnswer);
                  userAnsText = `${getOptionLetter(uIdx)}. ${q.options[uIdx]}`;
                }
                correctAnsText = `${getOptionLetter(q.correctAnswerIndex)}. ${q.options[q.correctAnswerIndex]}`;
              } else {
                if (userAns && userAns.userSelectedAnswer) {
                  userAnsText = userAns.userSelectedAnswer;
                }
                correctAnsText = q.correctAnswers.join(' / ');
              }

              return (
                <div key={q.id} className={`review-item ${isExpanded ? 'expanded' : ''}`}>
                  <div 
                    className="review-item-header"
                    onClick={() => toggleExpand(q.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                      <div className={`review-status-indicator ${isCorrect ? 'correct' : 'incorrect'}`}>
                        {isCorrect ? <Check size={14} /> : <X size={14} />}
                      </div>
                      <span className="review-question-txt" style={{ flex: 1 }}>
                        Q{q.questionNumber}. {q.questionText}
                      </span>
                    </div>
                    <ChevronDown className="review-chevron" size={18} />
                  </div>

                  <div className="review-item-body">
                    <div className="review-full-question">
                      {q.questionText}
                    </div>

                    <div className="answer-comparison-box">
                      <div className={`compare-card user ${isCorrect ? 'correct' : ''}`}>
                        <div className="compare-title">내가 고른 답</div>
                        <div className="compare-val">
                          {userAnsText}
                        </div>
                      </div>
                      <div className="compare-card correct-ans">
                        <div className="compare-title">정답</div>
                        <div className="compare-val">
                          {correctAnsText}
                        </div>
                      </div>
                    </div>

                    {q.explanation && (
                      <div className="explanation-card">
                        <div className="explanation-title">
                          <Award size={16} /> 해설
                        </div>
                        <div className="explanation-txt">
                          {q.explanation}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem', marginBottom: '3rem' }}>
          <button className="btn btn-primary" onClick={onRestart}>
            홈 화면으로 돌아가기
          </button>
        </div>
      </div>

      <footer>
        <div className="footer-container">
          <p>© 2026 AICE Basic Mock CBT. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}
