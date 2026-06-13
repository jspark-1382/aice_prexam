import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Clock, ChevronLeft, ChevronRight, Send, AlertCircle, HelpCircle, UploadCloud } from 'lucide-react';

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
  
  // AIDU Platform Simulator States
  const [uploadedFiles, setUploadedFiles] = useState({}); // { [filename]: { headers, rows } }
  const [activeFilename, setActiveFilename] = useState('');
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [aiduTab, setAiduTab] = useState('import'); // 'import' | 'describe' | 'sample'

  // Auto-sync intervals reference
  const syncTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const activeQuestion = questions[currentIdx] || null;
  const isDataAnalysisQuestion = activeQuestion?.category === '데이터 분석';

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

  async function saveProgressToDb() {
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
  }

  function handleAutoSubmit() {
    setSyncStatus('제한시간 종료. 제출 중...');
    submitExamFinal();
  }

  const handleSubmitClick = () => {
    setShowSubmitModal(true);
  };

  async function submitExamFinal() {
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
  }

  function goToNextQuestion() {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    }
  }

  function goToPrevQuestion() {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
  }

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

  // ==========================================
  // AIDU Platform Simulation Functions
  // ==========================================
  const parseCsvData = (text) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return { headers: [], rows: [] };
    
    // Parse header row
    const headers = splitCsvRow(lines[0]);
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const cells = splitCsvRow(line);
      if (cells.length === headers.length) {
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = cells[idx];
        });
        rows.push(row);
      }
    }
    return { headers, rows };
  };

  const splitCsvRow = (line) => {
    const cells = [];
    let inQuotes = false;
    let cell = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += c;
      }
    }
    cells.push(cell.trim());
    return cells;
  };

  const handleAiduFileUpload = (file) => {
    if (!file.name.endsWith('.csv')) {
      alert('CSV 형식의 파일만 업로드할 수 있습니다.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = parseCsvData(text);
      if (parsed.headers.length === 0) {
        alert('올바르지 않은 CSV 데이터 구조입니다.');
        return;
      }
      
      setUploadedFiles(prev => ({
        ...prev,
        [file.name]: parsed
      }));
      setActiveFilename(file.name);
      setSelectedColumns([]);
      setAnalysisResults(null);
      setAiduTab('describe');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const performAnalysis = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return;
    const { headers, rows } = uploadedFiles[activeFilename];
    if (rows.length === 0) return;
    
    const results = {};
    
    // Determine overall stats
    const totalObs = rows.length;
    const totalVars = headers.length;
    let totalMissing = 0;
    
    // Find column data types and calculate column stats
    selectedColumns.forEach(col => {
      const values = rows.map(r => r[col]);
      
      // Check column type (numeric if >= 90% parseable as numbers, ignoring blanks)
      const nonBlankVals = values.filter(v => v !== null && v !== undefined && v !== '');
      let isNumeric = false;
      let numericValues = [];
      
      if (nonBlankVals.length > 0) {
        numericValues = nonBlankVals.map(Number).filter(v => !isNaN(v));
        // If at least 90% of non-blank values are numeric, we treat column as numeric
        if (numericValues.length / nonBlankVals.length >= 0.9) {
          isNumeric = true;
        }
      }
      
      const missingCount = totalObs - nonBlankVals.length;
      totalMissing += missingCount;
      
      // Base stats
      const distinctValues = Array.from(new Set(nonBlankVals));
      const distinctCount = distinctValues.length;
      
      const colResults = {
        name: col,
        type: isNumeric ? 'numeric' : 'object',
        size: totalObs,
        distinct: distinctCount,
        distinctPct: ((distinctCount / totalObs) * 100).toFixed(2) + '%',
        missing: missingCount,
        missingPct: ((missingCount / totalObs) * 100).toFixed(2) + '%',
      };
      
      if (isNumeric && numericValues.length > 0) {
        // Zeros count
        const zerosCount = numericValues.filter(v => v === 0).length;
        colResults.zeros = zerosCount;
        colResults.zerosPct = ((zerosCount / totalObs) * 100).toFixed(2) + '%';
        
        // Sum, Mean
        const sum = numericValues.reduce((a, b) => a + b, 0);
        const mean = sum / numericValues.length;
        colResults.mean = mean.toFixed(2);
        
        // Min, Max
        numericValues.sort((a, b) => a - b);
        const min = numericValues[0];
        const max = numericValues[numericValues.length - 1];
        colResults.min = min;
        colResults.max = max;
        
        // Median (50th percentile)
        const getPercentile = (arr, p) => {
          if (arr.length === 0) return 0;
          const idx = (arr.length - 1) * p;
          const low = Math.floor(idx);
          const high = Math.ceil(idx);
          return arr[low] + (arr[high] - arr[low]) * (idx - low);
        };
        
        colResults.median = getPercentile(numericValues, 0.5).toFixed(2);
        
        // Standard Deviation
        const sqDiffs = numericValues.map(v => Math.pow(v - mean, 2));
        const variance = sqDiffs.reduce((a, b) => a + b, 0) / numericValues.length;
        const sd = Math.sqrt(variance);
        colResults.sd = sd.toFixed(2);
        
        // Skewness
        const skewness = sd > 0 ? (3 * (mean - parseFloat(colResults.median)) / sd) : 0;
        colResults.skewness = skewness.toFixed(2);
        
        // Quantiles
        colResults.quantiles = {
          min: min.toFixed(2),
          p5: getPercentile(numericValues, 0.05).toFixed(2),
          q1: getPercentile(numericValues, 0.25).toFixed(2),
          median: colResults.median,
          q3: getPercentile(numericValues, 0.75).toFixed(2),
          p95: getPercentile(numericValues, 0.95).toFixed(2),
          max: max.toFixed(2)
        };
        
        // Generate Histogram data (10 bins)
        const binCount = 10;
        const range = max - min;
        const binWidth = range > 0 ? range / binCount : 1;
        const bins = Array.from({ length: binCount }, (_, i) => {
          const binStart = min + i * binWidth;
          const binEnd = binStart + binWidth;
          return {
            start: binStart,
            end: binEnd,
            count: 0,
            label: range > 0 ? `${binStart.toFixed(0)}` : `${binStart.toFixed(0)}`
          };
        });
        
        numericValues.forEach(v => {
          let binIdx = Math.floor((v - min) / binWidth);
          if (binIdx >= binCount) binIdx = binCount - 1;
          if (binIdx < 0) binIdx = 0;
          bins[binIdx].count++;
        });
        
        colResults.chartData = bins.map(b => ({
          label: b.label,
          count: b.count,
          percentage: ((b.count / numericValues.length) * 100).toFixed(1)
        }));
      } else {
        // Categorical chart data (top 5 values count)
        const valueCounts = {};
        nonBlankVals.forEach(v => {
          valueCounts[v] = (valueCounts[v] || 0) + 1;
        });
        
        const sortedFrequencies = Object.keys(valueCounts)
          .map(k => ({ value: k, count: valueCounts[k] }))
          .sort((a, b) => b.count - a.count);
          
        colResults.topFrequencies = sortedFrequencies.slice(0, 5).map(item => ({
          value: item.value,
          count: item.count,
          percentage: ((item.count / nonBlankVals.length) * 100).toFixed(2) + '%'
        }));
        
        // Chart data for categorical (up to 5 categories + Others)
        const chartData = sortedFrequencies.slice(0, 5).map(item => ({
          label: item.value,
          count: item.count,
          percentage: ((item.count / nonBlankVals.length) * 100).toFixed(1)
        }));
        
        if (sortedFrequencies.length > 5) {
          const othersCount = sortedFrequencies.slice(5).reduce((a, b) => a + b.count, 0);
          chartData.push({
            label: 'Others',
            count: othersCount,
            percentage: ((othersCount / nonBlankVals.length) * 100).toFixed(1)
          });
        }
        colResults.chartData = chartData;
      }
      
      results[col] = colResults;
    });
    
    // Overall Stats Object
    const numericColsCount = selectedColumns.filter(c => results[c].type === 'numeric').length;
    const objectColsCount = selectedColumns.length - numericColsCount;
    
    const missingCellRatio = ((totalMissing / (totalObs * totalVars)) * 100).toFixed(2) + '%';
    
    // Calculate duplicated rows
    const serializedRows = rows.map(r => JSON.stringify(r));
    const uniqueSerializedRows = new Set(serializedRows);
    const duplicatedRowsCount = rows.length - uniqueSerializedRows.size;
    const duplicatedRowsRatio = ((duplicatedRowsCount / rows.length) * 100).toFixed(2) + '%';
    
    const overallStats = {
      num_of_obs: totalObs,
      num_of_var: totalVars,
      missing_cell: totalMissing,
      missing_cell_ratio: missingCellRatio,
      duplicated_rows: duplicatedRowsCount,
      duplicated_rows_ratio: duplicatedRowsRatio,
      types: {
        numeric: numericColsCount,
        object: objectColsCount
      }
    };
    
    setAnalysisResults({ overall: overallStats, columns: results });
  };

  const renderAiduImportTab = () => {
    return (
      <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>데이터 가져오기</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          분석에 사용할 CSV 파일을 업로드해 주세요. (예: `amount.csv` 또는 문제 지문에 명시된 데이터셋)
        </p>
        
        <div 
          className="aidu-import-zone"
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            if (files.length > 0) handleAiduFileUpload(files[0]);
          }}
          onClick={() => document.getElementById('aidu-file-input').click()}
        >
          <UploadCloud size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
          <p style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>여기에 CSV 파일을 드래그 앤 드롭 하거나 클릭하여 업로드</p>
          <input 
            type="file" 
            id="aidu-file-input" 
            accept=".csv" 
            style={{ display: 'none' }} 
            onChange={(e) => {
              if (e.target.files.length > 0) handleAiduFileUpload(e.target.files[0]);
            }}
          />
        </div>

        {Object.keys(uploadedFiles).length > 0 && (
          <div className="aidu-card">
            <div className="aidu-card-header">업로드된 데이터셋 목록</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Object.keys(uploadedFiles).map(name => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', backgroundColor: 'var(--bg-main)', borderRadius: '4px', fontSize: '0.85rem' }}>
                  <span>{name} ({uploadedFiles[name].rows.length}행)</span>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                    onClick={() => {
                      setActiveFilename(name);
                      setSelectedColumns([]);
                      setAnalysisResults(null);
                      setAiduTab('describe');
                    }}
                  >
                    분석실 이동
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAiduDescribeTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;
    const fileData = uploadedFiles[activeFilename];

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        {/* Left Settings Panel */}
        <div className="aidu-settings-panel">
          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>작업 데이터 선택</label>
            <select 
              className="form-control" 
              style={{ fontSize: '0.8rem', padding: '0.4rem' }}
              value={activeFilename}
              onChange={(e) => {
                setActiveFilename(e.target.value);
                setSelectedColumns([]);
                setAnalysisResults(null);
              }}
            >
              {Object.keys(uploadedFiles).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>데이터 범위</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <input 
                type="range" 
                min="0" 
                max={fileData.rows.length} 
                value={fileData.rows.length}
                disabled 
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>0</span>
                <span>{fileData.rows.length}</span>
              </div>
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold', margin: 0 }}>컬럼 선택</label>
              <button 
                type="button" 
                className="btn-text-action" 
                style={{ fontSize: '0.7rem' }}
                onClick={() => {
                  if (selectedColumns.length === fileData.headers.length) {
                    setSelectedColumns([]);
                  } else {
                    setSelectedColumns([...fileData.headers]);
                  }
                }}
              >
                {selectedColumns.length === fileData.headers.length ? '모두 해제' : '모두 선택'}
              </button>
            </div>
            
            <div className="aidu-column-list">
              {fileData.headers.map(col => {
                const isSelected = selectedColumns.includes(col);
                // Simple type check for UI label
                const firstVal = fileData.rows.find(r => r[col] !== '')?.[col];
                const isNum = firstVal !== undefined && !isNaN(Number(firstVal));
                
                return (
                  <div 
                    key={col} 
                    className={`aidu-column-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedColumns(selectedColumns.filter(c => c !== col));
                      } else {
                        setSelectedColumns([...selectedColumns, col]);
                      }
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{col}</span>
                    <span className="aidu-column-type">{isNum ? 'int64' : 'object'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <button 
            type="button" 
            className="btn btn-primary btn-full"
            style={{ fontSize: '0.85rem', padding: '0.6rem' }}
            onClick={performAnalysis}
            disabled={selectedColumns.length === 0}
          >
            분석하기
          </button>
        </div>

        {/* Right Results Panel */}
        <div className="aidu-results-panel">
          {!analysisResults ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', gap: '0.5rem' }}>
              <HelpCircle size={36} />
              <p style={{ fontSize: '0.85rem' }}>좌측에서 분석할 컬럼을 선택하고 [분석하기]를 눌러주세요.</p>
            </div>
          ) : (
            <>
              {/* Overall Statistics */}
              <div className="aidu-card">
                <div className="aidu-card-header">기초 정보 분석 결과</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem' }}>
                  <div>
                    <div className="aidu-section-title">데이터 정보</div>
                    <table className="aidu-table">
                      <thead>
                        <tr>
                          <th>항목</th>
                          <th>값</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>num_of_obs (관측치 수)</td>
                          <td style={{ fontWeight: 'bold' }}>{analysisResults.overall.num_of_obs.toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td>num_of_var (변수 수)</td>
                          <td style={{ fontWeight: 'bold' }}>{analysisResults.overall.num_of_var}</td>
                        </tr>
                        <tr>
                          <td>missing_cell (결측치 총합)</td>
                          <td>{analysisResults.overall.missing_cell}</td>
                        </tr>
                        <tr>
                          <td>missing_cell_ratio (결측 비율)</td>
                          <td>{analysisResults.overall.missing_cell_ratio}</td>
                        </tr>
                        <tr>
                          <td>duplicated_rows (중복 행)</td>
                          <td>{analysisResults.overall.duplicated_rows}</td>
                        </tr>
                        <tr>
                          <td>duplicated_rows_ratio (중복 비율)</td>
                          <td>{analysisResults.overall.duplicated_rows_ratio}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <div className="aidu-section-title">유형</div>
                    <table className="aidu-table">
                      <thead>
                        <tr>
                          <th>타입</th>
                          <th>개수</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>numeric (수치형)</td>
                          <td style={{ fontWeight: 'bold' }}>{analysisResults.overall.types.numeric}</td>
                        </tr>
                        <tr>
                          <td>object (범주형)</td>
                          <td style={{ fontWeight: 'bold' }}>{analysisResults.overall.types.object}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Column Breakdowns */}
              {Object.keys(analysisResults.columns).map(colName => {
                const col = analysisResults.columns[colName];
                const isNumeric = col.type === 'numeric';

                return (
                  <div key={colName} className="aidu-card">
                    <div className="aidu-card-header">
                      <span>{colName}</span>
                      <span className="aidu-column-type" style={{ backgroundColor: isNumeric ? 'var(--primary-light)' : 'var(--border-color)', color: isNumeric ? 'var(--primary)' : 'inherit' }}>
                        {isNumeric ? 'numeric (수치형)' : 'object (범주형)'}
                      </span>
                    </div>

                    <div className="aidu-results-grid">
                      {/* Left: Stats tables */}
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: isNumeric ? '1.2fr 0.8fr' : '1fr', gap: '1rem' }}>
                          <div>
                            <div className="aidu-section-title">기술통계</div>
                            <table className="aidu-table">
                              <tbody>
                                <tr>
                                  <td>size</td>
                                  <td>{col.size}</td>
                                </tr>
                                <tr>
                                  <td>distinct</td>
                                  <td>{col.distinct}</td>
                                </tr>
                                <tr>
                                  <td>distinct(%)</td>
                                  <td>{col.distinctPct}</td>
                                </tr>
                                <tr>
                                  <td>missing</td>
                                  <td>{col.missing}</td>
                                </tr>
                                <tr>
                                  <td>missing(%)</td>
                                  <td>{col.missingPct}</td>
                                </tr>
                                {isNumeric && (
                                  <>
                                    <tr>
                                      <td>zeros</td>
                                      <td>{col.zeros}</td>
                                    </tr>
                                    <tr>
                                      <td>zeros(%)</td>
                                      <td>{col.zerosPct}</td>
                                    </tr>
                                    <tr>
                                      <td>mean</td>
                                      <td style={{ fontWeight: 'bold' }}>{col.mean}</td>
                                    </tr>
                                    <tr>
                                      <td>median</td>
                                      <td>{col.median}</td>
                                    </tr>
                                    <tr>
                                      <td>sd</td>
                                      <td>{col.sd}</td>
                                    </tr>
                                    <tr>
                                      <td>skewness</td>
                                      <td>{col.skewness}</td>
                                    </tr>
                                  </>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {isNumeric && col.quantiles && (
                            <div>
                              <div className="aidu-section-title">분위수</div>
                              <table className="aidu-table">
                                <tbody>
                                  <tr>
                                    <td>min</td>
                                    <td>{col.quantiles.min}</td>
                                  </tr>
                                  <tr>
                                    <td>5th_per</td>
                                    <td>{col.quantiles.p5}</td>
                                  </tr>
                                  <tr>
                                    <td>q1</td>
                                    <td>{col.quantiles.q1}</td>
                                  </tr>
                                  <tr>
                                    <td>median</td>
                                    <td style={{ fontWeight: 'bold' }}>{col.quantiles.median}</td>
                                  </tr>
                                  <tr>
                                    <td>q3</td>
                                    <td>{col.quantiles.q3}</td>
                                  </tr>
                                  <tr>
                                    <td>95th_per</td>
                                    <td>{col.quantiles.p95}</td>
                                  </tr>
                                  <tr>
                                    <td>max</td>
                                    <td>{col.quantiles.max}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {!isNumeric && col.topFrequencies && (
                          <div style={{ marginTop: '1rem' }}>
                            <div className="aidu-section-title">최빈값 (상위 5개)</div>
                            <table className="aidu-table">
                              <thead>
                                <tr>
                                  <th>값</th>
                                  <th>빈도</th>
                                  <th>비율</th>
                                </tr>
                              </thead>
                              <tbody>
                                {col.topFrequencies.map((item, i) => (
                                  <tr key={i}>
                                    <td style={{ fontWeight: 'bold' }}>{item.value === '' ? '(empty)' : item.value}</td>
                                    <td>{item.count}</td>
                                    <td>{item.percentage}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Right: Chart */}
                      <div className="aidu-chart-card">
                        <div className="aidu-section-title">{isNumeric ? '히스토그램' : '바차트'}</div>
                        <div className="aidu-chart-wrapper">
                          <div className="aidu-chart-container">
                            {col.chartData && col.chartData.map((bar, i) => {
                              const barHeight = parseFloat(bar.percentage);
                              return (
                                <div key={i} className="aidu-chart-bar-wrapper">
                                  <div 
                                    className="aidu-chart-bar" 
                                    style={{ height: `${Math.max(barHeight, 3)}%` }}
                                  >
                                    <div className="aidu-chart-bar-tooltip">
                                      {bar.label}: {bar.count}개 ({bar.percentage}%)
                                    </div>
                                  </div>
                                  <div className="aidu-chart-bar-label" title={bar.label}>
                                    {bar.label}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderAiduSampleTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;
    const { headers, rows } = uploadedFiles[activeFilename];

    return (
      <div style={{ flex: 1, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>데이터 샘플 보기 (상위 100행)</h3>
        
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)' }}>
          <table className="aidu-table" style={{ minWidth: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                <th style={{ width: '50px', backgroundColor: 'var(--bg-main)', position: 'sticky', left: 0 }}>#</th>
                {headers.map(h => (
                  <th key={h} style={{ backgroundColor: 'var(--bg-main)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 'bold', backgroundColor: 'var(--bg-main)', position: 'sticky', left: 0 }}>{idx + 1}</td>
                  {headers.map(h => (
                    <td key={h}>{row[h]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderAiduContainer = () => {
    return (
      <div className="aidu-container">
        {/* Topbar */}
        <div className="aidu-topbar">
          <div className="aidu-topbar-left">
            <span className="aidu-logo">AIDU</span>
            <button type="button" className="aidu-topbar-btn" onClick={() => {
              if (activeFilename) {
                setSelectedColumns([]);
                setAnalysisResults(null);
              }
            }}>
              새로고침
            </button>
            <button type="button" className="aidu-topbar-btn" onClick={() => {
              setUploadedFiles({});
              setActiveFilename('');
              setSelectedColumns([]);
              setAnalysisResults(null);
              setAiduTab('import');
            }}>
              데이터 초기화
            </button>
          </div>
          <span className="aidu-workspace-info">
            {activeFilename ? `현재 작업데이터: ${activeFilename}` : '현재 작업공간: New_Workspace_AICE_Basic'}
          </span>
        </div>

        {/* Workspace Body */}
        <div className="aidu-workspace-body">
          {/* Sidebar */}
          <div className="aidu-sidebar">
            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'import' ? 'active' : ''}`}
              onClick={() => setAiduTab('import')}
            >
              데이터 가져오기
            </button>
            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'describe' ? 'active' : ''}`}
              onClick={() => {
                if (!activeFilename) {
                  alert('분석할 데이터를 먼저 가져오기(업로드) 해주세요.');
                  return;
                }
                setAiduTab('describe');
              }}
            >
              기초 정보 분석
            </button>
            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'sample' ? 'active' : ''}`}
              onClick={() => {
                if (!activeFilename) {
                  alert('데이터를 먼저 가져오기(업로드) 해주세요.');
                  return;
                }
                setAiduTab('sample');
              }}
            >
              데이터 샘플 보기
            </button>
          </div>

          {/* Main Content Pane */}
          <div className="aidu-main-content">
            {aiduTab === 'import' && renderAiduImportTab()}
            {aiduTab === 'describe' && renderAiduDescribeTab()}
            {aiduTab === 'sample' && renderAiduSampleTab()}
          </div>
        </div>
      </div>
    );
  };

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
      <main className={`main-layout ${isDataAnalysisQuestion ? 'split-layout-active' : ''}`}>
        {isDataAnalysisQuestion ? (
          // ==========================================
          // DUAL-PANE SPLIT LAYOUT (AIDU + Quiz)
          // ==========================================
          <>
            {/* Left Pane: AIDU Platform */}
            <section style={{ overflow: 'hidden' }}>
              {renderAiduContainer()}
            </section>

            {/* Right Pane: Quiz Card & Grid */}
            <section className="quiz-panel-right">
              {/* Timer Bar */}
              {(attempt.Exam?.timeMode === 'total' || attempt.Exam?.timeMode === 'per-question') && (
                <div className="timer-container" style={{ marginBottom: 0 }}>
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
                <div className="card" style={{ marginBottom: 0 }}>
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
                    </div>
                  )}

                  {/* Context Box */}
                  {activeQuestion.reference && renderContext(activeQuestion.reference)}

                  {/* Question Title */}
                  <div className="question-title-container">
                    <div className="question-number">Q{activeQuestion.questionNumber}</div>
                    <div className="question-text" style={{ fontSize: '1.1rem' }}>{activeQuestion.questionText}</div>
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
                          style={{ padding: '0.9rem 1.25rem', fontSize: '0.9rem' }}
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
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Prev/Next Buttons */}
              <div className="nav-buttons" style={{ marginTop: 0 }}>
                <button 
                  className="btn btn-secondary"
                  onClick={goToPrevQuestion}
                  disabled={currentIdx === 0}
                >
                  <ChevronLeft size={16} /> 이전
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={goToNextQuestion}
                  disabled={currentIdx === questions.length - 1}
                >
                  다음 <ChevronRight size={16} />
                </button>
              </div>

              {/* Navigation Grid (Inside Sidebar) */}
              <div className="sidebar-card" style={{ padding: '1.25rem', marginBottom: 0 }}>
                <div className="sidebar-title" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                  <span>문항 네비게이션</span>
                  <span className="sidebar-stats">완료 {answeredCount}/{questions.length}</span>
                </div>

                <div className="question-grid" style={{ marginBottom: '1rem', gap: '0.5rem' }}>
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
                        style={{ height: '35px', width: '35px' }}
                      >
                        {q.questionNumber}
                      </button>
                    );
                  })}
                </div>

                <div className="submit-box" style={{ paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                  <button 
                    className="btn btn-success btn-full"
                    onClick={handleSubmitClick}
                  >
                    <Send size={16} /> 시험 제출하기
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : (
          // ==========================================
          // STANDARD SINGLE LAYOUT (Non-Data Analysis)
          // ==========================================
          <>
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
          </>
        )}
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
