import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Clock, ChevronLeft, ChevronRight, Send, AlertCircle, HelpCircle, UploadCloud, Home, Database, Brain, Cpu, Settings, BarChart2 } from 'lucide-react';

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
  const [dataRangeStart, setDataRangeStart] = useState(0);
  const [dataRangeEnd, setDataRangeEnd] = useState(0);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [dataAnalysisExpanded, setDataAnalysisExpanded] = useState(true);

  // Visualization States
  const [vizX, setVizX] = useState('');
  const [vizY, setVizY] = useState('');
  const [vizType, setVizType] = useState('scatter'); // 'scatter' | 'correlation'

  // Preprocessing States
  const [preprocessDropNa, setPreprocessDropNa] = useState(false);
  const [preprocessOneHot, setPreprocessOneHot] = useState(false);
  const [preprocessScale, setPreprocessScale] = useState(false);
  const [preprocessStatus, setPreprocessStatus] = useState('');

  // AI Training States
  const [modelTarget, setModelTarget] = useState('');
  const [modelFeatures, setModelFeatures] = useState([]);
  const [modelType, setModelType] = useState('linear'); // 'linear' | 'tree'
  const [trainedModel, setTrainedModel] = useState(null);
  const [isTraining, setIsTraining] = useState(false);

  // AI Prediction States
  const [predictInputs, setPredictInputs] = useState({});
  const [predictionResult, setPredictionResult] = useState(null);

  // Auto-sync intervals reference
  const syncTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const activeQuestion = questions[currentIdx] || null;
  const hasAiduData = !!attempt.Exam?.csvData;

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

    let parsed = null;
    if (attempt.timeLeftMapJson) {
      try {
        parsed = JSON.parse(attempt.timeLeftMapJson);
      } catch (e) {
        console.error('Error parsing timeLeftMapJson:', e);
      }
    }

    setTimeout(() => {
      setAnswers(ansObj);
      setTimeTakenMap(timeTakenObj);
      if (parsed) {
        setTimeLeftMap(parsed);
      }
    }, 0);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, timeLeft, timeLeftMap, timeTakenMap]);

  // Preload CSV dataset if present on Exam
  useEffect(() => {
    if (attempt.Exam && attempt.Exam.csvData) {
      const filename = attempt.Exam.csvFilename || 'exam_data.csv';
      if (!uploadedFiles[filename]) {
        const parsed = parseCsvData(attempt.Exam.csvData);
        setTimeout(() => {
          setUploadedFiles(prev => ({
            ...prev,
            [filename]: parsed
          }));
          setActiveFilename(filename);
          setSelectedColumns([...parsed.headers]);
          
          const N = parsed.rows.length;
          const defaultStart = Math.round(N * 0.2);
          setDataRangeStart(defaultStart);
          setDataRangeEnd(N);
          
          setAnalysisResults(null);
          setAiduTab('describe'); // Open 기초정보분석
        }, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

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
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      const nextC = text[i + 1];
      
      if (inQuotes) {
        if (c === '"') {
          if (nextC === '"') {
            currentCell += '"';
            i += 2;
            continue;
          } else {
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          currentCell += c;
          i++;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
          i++;
        } else if (c === ',') {
          currentRow.push(currentCell.trim());
          currentCell = '';
          i++;
        } else if (c === '\r' || c === '\n') {
          currentRow.push(currentCell.trim());
          currentCell = '';
          
          if (currentRow.length > 0 && (currentRow.length > 1 || currentRow[0] !== '')) {
            rows.push(currentRow);
          }
          currentRow = [];
          
          if (c === '\r' && nextC === '\n') {
            i += 2;
          } else {
            i++;
          }
        } else {
          currentCell += c;
          i++;
        }
      }
    }
    
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.length > 0 && (currentRow.length > 1 || currentRow[0] !== '')) {
        rows.push(currentRow);
      }
    }
    
    if (rows.length === 0) return { headers: [], rows: [] };
    
    const headers = rows[0];
    const dataRows = [];
    
    for (let r = 1; r < rows.length; r++) {
      const rowData = {};
      headers.forEach((h, idx) => {
        rowData[h] = rows[r][idx] !== undefined ? rows[r][idx] : '';
      });
      dataRows.push(rowData);
    }
    
    return { headers, rows: dataRows };
  };

  const handleAiduFileUpload = (file) => {
    if (!file.name.endsWith('.csv')) {
      alert('CSV 형식의 파일만 업로드할 수 있습니다.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target.result;
      
      let text;
      try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        text = utf8Decoder.decode(arrayBuffer);
      } catch {
        try {
          const eucKrDecoder = new TextDecoder('euc-kr');
          text = eucKrDecoder.decode(arrayBuffer);
        } catch {
          alert('파일 디코딩 실패: 파일의 인코딩을 확인해 주세요.');
          return;
        }
      }
      
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
      setSelectedColumns([...parsed.headers]);
      
      const N = parsed.rows.length;
      const defaultStart = Math.round(N * 0.2);
      setDataRangeStart(defaultStart);
      setDataRangeEnd(N);
      
      setAnalysisResults(null);
      setAiduTab('describe');
    };
    reader.readAsArrayBuffer(file);
  };

  const performAnalysis = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return;
    const { headers, rows } = uploadedFiles[activeFilename];
    if (rows.length === 0) return;
    
    const activeRows = rows.slice(dataRangeStart, dataRangeEnd);
    if (activeRows.length === 0) {
      alert('분석할 데이터 범위에 행이 존재하지 않습니다.');
      return;
    }
    
    const results = {};
    
    // Determine overall stats
    const totalObs = activeRows.length;
    const totalVars = headers.length;
    let totalMissing = 0;
    
    // Find column data types and calculate column stats
    selectedColumns.forEach(col => {
      const values = activeRows.map(r => r[col]);
      
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
    const serializedRows = activeRows.map(r => JSON.stringify(r));
    const uniqueSerializedRows = new Set(serializedRows);
    const duplicatedRowsCount = activeRows.length - uniqueSerializedRows.size;
    const duplicatedRowsRatio = ((duplicatedRowsCount / activeRows.length) * 100).toFixed(2) + '%';
    
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
                      const file = uploadedFiles[name];
                      if (file) {
                        setSelectedColumns([...file.headers]);
                        const N = file.rows.length;
                        const defaultStart = Math.round(N * 0.2);
                        setDataRangeStart(defaultStart);
                        setDataRangeEnd(N);
                      }
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
                const fname = e.target.value;
                setActiveFilename(fname);
                const file = uploadedFiles[fname];
                if (file) {
                  setSelectedColumns([...file.headers]);
                  const N = file.rows.length;
                  const defaultStart = Math.round(N * 0.2);
                  setDataRangeStart(defaultStart);
                  setDataRangeEnd(N);
                }
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
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.15rem' }}>시작행</span>
                <input 
                  type="number" 
                  className="form-control"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', width: '100%', height: '28px' }}
                  min="0"
                  max={dataRangeEnd}
                  value={dataRangeStart}
                  onChange={(e) => {
                    const val = Math.min(Math.max(0, Number(e.target.value)), dataRangeEnd);
                    setDataRangeStart(val);
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.15rem' }}>종료행</span>
                <input 
                  type="number" 
                  className="form-control"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', width: '100%', height: '28px' }}
                  min={dataRangeStart}
                  max={fileData.rows.length}
                  value={dataRangeEnd}
                  onChange={(e) => {
                    const val = Math.max(dataRangeStart, Math.min(Number(e.target.value), fileData.rows.length));
                    setDataRangeEnd(val);
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <input 
                type="range" 
                min="0" 
                max={fileData.rows.length} 
                value={dataRangeStart}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val <= dataRangeEnd) {
                    setDataRangeStart(val);
                  }
                }}
                style={{ width: '100%', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                <span>시작: {dataRangeStart}</span>
                <span>끝: {dataRangeEnd}</span>
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

  // -------------------------------------------------------------
  // AIDU Platform Simulator Sub-tab Renderers
  // -------------------------------------------------------------

  const renderAiduHomeTab = () => {
    return (
      <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
        <div style={{ padding: '2rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--primary)', marginBottom: '0.75rem' }}>AIDU 데이터 분석 및 인공지능 플랫폼</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            본 모의고사 평가 시스템에는 AICE 실기 시험 대비를 위한 **AIDU 시뮬레이터**가 기본 통합되어 있습니다.<br />
            좌측 메뉴를 활용하여 업로드된 데이터셋의 기초 정보를 분석하고, 시각화하고, AI 모델을 학습/활용할 수 있습니다.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="aidu-card">
            <div className="aidu-card-header">작업 공간 정보</div>
            <table className="aidu-table">
              <tbody>
                <tr>
                  <td>프로젝트명</td>
                  <td style={{ fontWeight: '600' }}>AICE_Basic_Mock_Project</td>
                </tr>
                <tr>
                  <td>활성 데이터셋</td>
                  <td>{activeFilename ? activeFilename : '선택된 데이터셋 없음'}</td>
                </tr>
                <tr>
                  <td>전체 로드된 파일 수</td>
                  <td>{Object.keys(uploadedFiles).length}개</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="aidu-card">
            <div className="aidu-card-header">사용 안내</div>
            <ul style={{ fontSize: '0.8rem', paddingLeft: '1.2rem', lineHeight: '1.6', color: 'var(--text-main)' }}>
              <li><strong>데이터 가져오기</strong>: 분석용 CSV 파일을 선택하거나 추가 업로드합니다.</li>
              <li><strong>기초정보분석</strong>: 수치형/범주형 변수의 통계량 및 히스토그램을 연산합니다.</li>
              <li><strong>데이터 가공</strong>: 결측치 제거, 원핫 인코딩 등 가공을 수행합니다.</li>
              <li><strong>AI 모델 학습</strong>: 선형 회귀 등을 통해 학습하고 성능 지표를 도출합니다.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderAiduVisualizeTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;
    const { headers, rows } = uploadedFiles[activeFilename];

    // Helper: Find numeric columns
    const numericCols = headers.filter(h => {
      const nonBlank = rows.map(r => r[h]).filter(v => v !== '');
      if (nonBlank.length === 0) return false;
      return nonBlank.every(v => !isNaN(Number(v)));
    });

    const activeX = vizX || numericCols[0] || headers[0] || '';
    const activeY = vizY || numericCols[1] || headers[1] || '';

    // Calculate correlation heatmap matrix if correlation selected
    const getCorrelationMatrix = () => {
      const cols = numericCols.slice(0, 5); // Max 5 columns for heat map
      const matrix = [];
      const N = rows.length;

      cols.forEach(c1 => {
        const rowData = { column: c1 };
        cols.forEach(c2 => {
          const v1 = rows.map(r => Number(r[c1])).filter(v => !isNaN(v));
          const v2 = rows.map(r => Number(r[c2])).filter(v => !isNaN(v));
          
          if (v1.length === 0 || v2.length === 0) {
            rowData[c2] = 0;
            return;
          }
          const mean1 = v1.reduce((a, b) => a + b, 0) / N;
          const mean2 = v2.reduce((a, b) => a + b, 0) / N;

          let num = 0;
          let den1 = 0;
          let den2 = 0;
          for (let i = 0; i < N; i++) {
            const diff1 = Number(rows[i][c1] || 0) - mean1;
            const diff2 = Number(rows[i][c2] || 0) - mean2;
            num += diff1 * diff2;
            den1 += Math.pow(diff1, 2);
            den2 += Math.pow(diff2, 2);
          }
          const correlation = den1 && den2 ? num / Math.sqrt(den1 * den2) : 0;
          rowData[c2] = correlation;
        });
        matrix.push(rowData);
      });
      return { columns: cols, matrix };
    };

    const corrData = vizType === 'correlation' ? getCorrelationMatrix() : null;

    // Render Scatter SVG points
    const renderScatterPlot = () => {
      const xVals = rows.map(r => Number(r[activeX])).filter(v => !isNaN(v));
      const yVals = rows.map(r => Number(r[activeY])).filter(v => !isNaN(v));
      if (xVals.length === 0 || yVals.length === 0) return <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>수치형 데이터를 포함하고 있지 않습니다.</p>;

      const xMin = Math.min(...xVals);
      const xMax = Math.max(...xVals);
      const yMin = Math.min(...yVals);
      const yMax = Math.max(...yVals);

      const width = 450;
      const height = 240;
      const padding = 40;

      const points = rows.map((r, idx) => {
        const x = Number(r[activeX]);
        const y = Number(r[activeY]);
        if (isNaN(x) || isNaN(y)) return null;

        const cx = padding + ((x - xMin) / (xMax - xMin || 1)) * (width - 2 * padding);
        const cy = height - padding - ((y - yMin) / (yMax - yMin || 1)) * (height - 2 * padding);

        return <circle key={idx} cx={cx} cy={cy} r="4" fill="var(--primary)" opacity="0.6" />;
      }).filter(Boolean).slice(0, 100); // Draw top 100 points for responsiveness

      return (
        <svg width="100%" height="240" style={{ border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)' }}>
          {/* Grid lines */}
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--text-light)" strokeWidth="2" />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--text-light)" strokeWidth="2" />
          
          {points}

          {/* Labels */}
          <text x={width / 2} y={height - 5} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{activeX}</text>
          <text x="12" y={height / 2} textAnchor="middle" fontSize="10" transform={`rotate(-90 12 ${height / 2})`} fill="var(--text-muted)">{activeY}</text>
          
          {/* Min/Max values */}
          <text x={padding} y={height - padding + 15} fontSize="9" fill="var(--text-muted)" textAnchor="middle">{xMin.toFixed(0)}</text>
          <text x={width - padding} y={height - padding + 15} fontSize="9" fill="var(--text-muted)" textAnchor="middle">{xMax.toFixed(0)}</text>
          <text x={padding - 5} y={height - padding} fontSize="9" fill="var(--text-muted)" textAnchor="end" dominantBaseline="middle">{yMin.toFixed(0)}</text>
          <text x={padding - 5} y={padding} fontSize="9" fill="var(--text-muted)" textAnchor="end" dominantBaseline="middle">{yMax.toFixed(0)}</text>
        </svg>
      );
    };

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        <div className="aidu-settings-panel">
          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>차트 유형</label>
            <select className="form-control" style={{ fontSize: '0.8rem' }} value={vizType} onChange={(e) => setVizType(e.target.value)}>
              <option value="scatter">산점도 (Scatter Plot)</option>
              <option value="correlation">상관관계 Heatmap</option>
            </select>
          </div>

          {vizType === 'scatter' && (
            <>
              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>X축 변수</label>
                <select className="form-control" style={{ fontSize: '0.8rem' }} value={activeX} onChange={(e) => setVizX(e.target.value)}>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Y축 변수</label>
                <select className="form-control" style={{ fontSize: '0.8rem' }} value={activeY} onChange={(e) => setVizY(e.target.value)}>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="aidu-results-panel">
          <div className="aidu-card">
            <div className="aidu-card-header">시각화 분석 결과</div>
            {vizType === 'scatter' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  선택한 두 수치형 변수 ({activeX} - {activeY})의 관계 분포를 산점도로 확인합니다.
                </p>
                {renderScatterPlot()}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  주요 수치형 컬럼들 간의 피어슨 상관계수(Pearson Correlation)를 그리드로 시각화합니다.
                </p>
                {corrData && (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="aidu-table" style={{ borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>변수명</th>
                          {corrData.columns.map(c => <th key={c}>{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {corrData.matrix.map((row, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: '600', textAlign: 'left', backgroundColor: 'var(--bg-main)' }}>{row.column}</td>
                            {corrData.columns.map(c => {
                              const val = row[c];
                              // Calculate color gradient based on correlation coefficient
                              let cellBg = 'rgba(255,255,255,0.05)';
                              if (val > 0) cellBg = `rgba(79, 70, 229, ${val})`; // Blue tones
                              else if (val < 0) cellBg = `rgba(239, 68, 68, ${Math.abs(val)})`; // Red tones
                              
                              return (
                                <td 
                                  key={c} 
                                  style={{ 
                                    backgroundColor: cellBg, 
                                    color: Math.abs(val) > 0.5 ? '#ffffff' : 'var(--text-main)',
                                    fontWeight: 'bold',
                                    padding: '0.6rem'
                                  }}
                                >
                                  {val.toFixed(2)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAiduUnsupervisedTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        <div className="aidu-settings-panel">
          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>비지도 분석 유형</label>
            <select className="form-control" style={{ fontSize: '0.8rem' }} disabled>
              <option>K-Means Clustering</option>
            </select>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>클러스터 개수 (K)</label>
            <select className="form-control" style={{ fontSize: '0.8rem' }}>
              <option>2</option>
              <option>3</option>
              <option>4</option>
            </select>
          </div>

          <button type="button" className="btn btn-primary btn-full" style={{ fontSize: '0.85rem' }} onClick={() => alert('본 모의고사 평가의 비지도 학습 분석 연산 기능은 데모 모드입니다.')}>
            군집화 수행
          </button>
        </div>

        <div className="aidu-results-panel">
          <div className="aidu-card" style={{ padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
            <HelpCircle size={48} color="var(--primary)" />
            <h4 style={{ fontWeight: 'bold', fontSize: '1rem', margin: 0 }}>비지도 학습 분석 (Clustering)</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '400px', lineHeight: '1.5' }}>
              K-Means 군집 분석은 라벨(정답)이 없는 데이터 포인트들을 거리 기반으로 유사한 k개의 집합으로 묶어주는 인공지능 기법입니다.<br />
              본 Mock 평가에서는 수치형 기초 통계분석 및 가공/회귀 모델 학습 위주로 비지도 분석은 기본 안내 데모만 제공됩니다.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderAiduPreprocessTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;
    const { headers, rows } = uploadedFiles[activeFilename];

    const handleRunPreprocess = () => {
      setPreprocessStatus('가공 분석 처리 중...');
      
      setTimeout(() => {
        let processedRows = [...rows];
        
        // 1. Drop NA
        if (preprocessDropNa) {
          processedRows = processedRows.filter(r => {
            return Object.values(r).every(v => v !== null && v !== undefined && v !== '');
          });
        }

        // 2. One-hot Encode (Let's detect object columns and encode top ones)
        let processedHeaders = [...headers];
        if (preprocessOneHot) {
          const categoricalCols = headers.filter(h => {
            const nonBlank = rows.map(r => r[h]).filter(v => v !== '');
            return nonBlank.some(v => isNaN(Number(v)));
          });

          categoricalCols.forEach(col => {
            // Find unique values
            const uniqueVals = Array.from(new Set(rows.map(r => r[col]).filter(Boolean))).slice(0, 4); // limit 4 values
            
            // Add new headers
            uniqueVals.forEach(val => {
              const newHeader = `${col}_${val}`;
              if (!processedHeaders.includes(newHeader)) {
                processedHeaders.push(newHeader);
              }
            });

            // Update row cells
            processedRows = processedRows.map(r => {
              const updatedRow = { ...r };
              const cellVal = r[col];
              uniqueVals.forEach(val => {
                updatedRow[`${col}_${val}`] = (cellVal === val) ? '1' : '0';
              });
              return updatedRow;
            });
          });
        }

        // 3. Standardization (StandardScaler for numeric columns)
        if (preprocessScale) {
          const numericCols = headers.filter(h => {
            const nonBlank = rows.map(r => r[h]).filter(v => v !== '');
            return nonBlank.length > 0 && nonBlank.every(v => !isNaN(Number(v)));
          });

          numericCols.forEach(col => {
            const vals = processedRows.map(r => Number(r[col])).filter(v => !isNaN(v));
            if (vals.length > 0) {
              const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
              const sd = Math.sqrt(vals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / vals.length) || 1;
              
              processedRows = processedRows.map(r => {
                const updatedRow = { ...r };
                const originalVal = Number(r[col]);
                if (!isNaN(originalVal)) {
                  updatedRow[col] = ((originalVal - mean) / sd).toFixed(4);
                }
                return updatedRow;
              });
            }
          });
        }

        const newFilename = `${activeFilename.replace('.csv', '')}_processed.csv`;
        setUploadedFiles(prev => ({
          ...prev,
          [newFilename]: { headers: processedHeaders, rows: processedRows }
        }));
        
        setActiveFilename(newFilename);
        setSelectedColumns([...processedHeaders]);
        const N = processedRows.length;
        setDataRangeStart(0);
        setDataRangeEnd(N);
        setAnalysisResults(null);
        setPreprocessStatus('가공 완료!');
        
        alert(`데이터 가공 성공!\n새로운 데이터셋 [${newFilename}]이 생성되어 로드되었습니다.`);
        setAiduTab('describe'); // Switch back to Descriptive Stats!
      }, 1000);
    };

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        <div className="aidu-settings-panel">
          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>가공 도구 선택</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={preprocessDropNa} onChange={(e) => setPreprocessDropNa(e.target.checked)} />
                결측값 제거 (Drop NaN)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={preprocessOneHot} onChange={(e) => setPreprocessOneHot(e.target.checked)} />
                원핫 인코딩 (One-Hot)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={preprocessScale} onChange={(e) => setPreprocessScale(e.target.checked)} />
                표준화 (StandardScaler)
              </label>
            </div>
          </div>

          <button 
            type="button" 
            className="btn btn-primary btn-full" 
            style={{ fontSize: '0.85rem' }} 
            onClick={handleRunPreprocess}
            disabled={!preprocessDropNa && !preprocessOneHot && !preprocessScale}
          >
            {preprocessStatus || '가공 실행하기'}
          </button>
        </div>

        <div className="aidu-results-panel">
          <div className="aidu-card">
            <div className="aidu-card-header">데이터 전처리 (Preprocessing) 가이드</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              기계 학습 성능을 최대화하기 위해 데이터를 분석에 적합하도록 포맷을 맞추는 전처리 과정입니다.<br /><br />
              - <strong>결측값 제거</strong>: 값이 비어 있는(Null) 행들을 일괄 탈락 처리합니다.<br />
              - <strong>원핫 인코딩</strong>: 문자열 범주형(object) 변수를 바이너리(0 또는 1) 원핫 컬럼 피처들로 자동 생성 변환합니다.<br />
              - <strong>표준화 (StandardScaler)</strong>: 수치 변수들의 값 범위를 평균 0, 표준편차 1을 갖는 표준정규분포로 스케일링합니다.
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Multiple Linear Regression gradient descent solver in Javascript
  const runLinearRegression = (X_cols, Y_col, dataRows) => {
    // Get numeric data
    const dataset = dataRows.map(r => {
      const row = { y: Number(r[Y_col]) };
      X_cols.forEach(x => { row[x] = Number(r[x]); });
      return row;
    }).filter(row => !isNaN(row.y) && X_cols.every(x => !isNaN(row[x])));
    
    if (dataset.length === 0) return null;
    
    const N = dataset.length;
    const Y_vals = dataset.map(d => d.y);
    const X_vals = dataset.map(d => X_cols.map(x => d[x]));
    
    // Mean of Y
    const meanY = Y_vals.reduce((a, b) => a + b, 0) / N;
    const meanX = X_cols.map((_, i) => X_vals.reduce((sum, row) => sum + row[i], 0) / N);
    
    // Gradient Descent solver
    let weights = X_cols.map(() => 0.0);
    let bias = meanY;
    const learningRate = 0.01;
    const epochs = 500;
    
    // Standardize for stable training
    const stdX = X_cols.map((_, i) => {
      const avg = meanX[i];
      const sqDiff = X_vals.reduce((sum, row) => sum + Math.pow(row[i] - avg, 2), 0);
      const sd = Math.sqrt(sqDiff / N) || 1;
      return { avg, sd };
    });
    const stdY = {
      avg: meanY,
      sd: Math.sqrt(Y_vals.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0) / N) || 1
    };
    
    // Normalized X & Y
    const normX = X_vals.map(row => row.map((val, i) => (val - stdX[i].avg) / stdX[i].sd));
    const normY = Y_vals.map(val => (val - stdY.avg) / stdY.sd);
    
    for (let epoch = 0; epoch < epochs; epoch++) {
      for (let i = 0; i < N; i++) {
        const pred = normX[i].reduce((sum, val, idx) => sum + val * weights[idx], 0) + bias;
        const error = pred - normY[i];
        
        bias -= learningRate * error / N;
        weights = weights.map((w, idx) => w - learningRate * error * normX[i][idx] / N);
      }
    }
    
    // Denormalize weights
    const origWeights = X_cols.map((_, i) => weights[i] * stdY.sd / stdX[i].sd);
    const origBias = stdY.sd * (bias - X_cols.reduce((sum, _, i) => sum + weights[i] * stdX[i].avg / stdX[i].sd, 0)) + stdY.avg;
    
    // Calculate R2 Score & MSE
    let totalSqError = 0;
    let totalVarY = 0;
    for (let i = 0; i < N; i++) {
      const pred = X_vals[i].reduce((sum, val, idx) => sum + val * origWeights[idx], 0) + origBias;
      totalSqError += Math.pow(pred - Y_vals[i], 2);
      totalVarY += Math.pow(Y_vals[i] - meanY, 2);
    }
    const mse = totalSqError / N;
    const r2 = totalVarY > 0 ? (1 - (totalSqError / totalVarY)) : 1;
    
    return {
      coefficients: origWeights.map(w => Number(w.toFixed(4))),
      intercept: Number(origBias.toFixed(4)),
      r2: Number(Math.max(0, r2).toFixed(4)),
      mse: Number(mse.toFixed(4)),
      features: X_cols,
      target: Y_col
    };
  };

  const renderAiduModelTrainTab = () => {
    if (!activeFilename || !uploadedFiles[activeFilename]) return null;
    const { headers, rows } = uploadedFiles[activeFilename];

    // Filter numeric headers for features/target
    const numericCols = headers.filter(h => {
      const nonBlank = rows.map(r => r[h]).filter(v => v !== '');
      return nonBlank.length > 0 && nonBlank.every(v => !isNaN(Number(v)));
    });

    const handleFeatureToggle = (col) => {
      if (modelFeatures.includes(col)) {
        setModelFeatures(modelFeatures.filter(f => f !== col));
      } else {
        setModelFeatures([...modelFeatures, col]);
      }
    };

    const handleTrainModel = () => {
      if (!modelTarget) {
        alert('예측할 종속 변수(Target)를 선택해 주세요.');
        return;
      }
      if (modelFeatures.length === 0) {
        alert('학습에 사용할 독립 변수(Feature)를 하나 이상 선택해 주세요.');
        return;
      }
      if (modelFeatures.includes(modelTarget)) {
        alert('종속 변수와 독립 변수는 중복될 수 없습니다.');
        return;
      }

      setIsTraining(true);
      
      setTimeout(() => {
        const slicedRows = rows.slice(dataRangeStart, dataRangeEnd);
        const results = runLinearRegression(modelFeatures, modelTarget, slicedRows);
        
        if (!results) {
          alert('학습 연산 처리 중 요효한 수치형 데이터를 추출하지 못했습니다.');
          setIsTraining(false);
          return;
        }

        setTrainedModel(results);
        setIsTraining(false);

        // Initialize prediction inputs state
        const initialInputs = {};
        modelFeatures.forEach(f => { initialInputs[f] = ''; });
        setPredictInputs(initialInputs);
        setPredictionResult(null);
      }, 1000);
    };

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        <div className="aidu-settings-panel">
          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>학습 알고리즘</label>
            <select className="form-control" style={{ fontSize: '0.8rem' }} value={modelType} onChange={(e) => setModelType(e.target.value)}>
              <option value="linear">선형 회귀 (Linear Regression)</option>
              <option value="tree" disabled>의사결정나무 (Decision Tree) - 준비중</option>
            </select>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>종속 변수 (Target)</label>
            <select 
              className="form-control" 
              style={{ fontSize: '0.8rem' }} 
              value={modelTarget} 
              onChange={(e) => setModelTarget(e.target.value)}
            >
              <option value="">-- 선택 --</option>
              {numericCols.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '0.4rem' }}>독립 변수 (Features)</label>
            <div className="aidu-column-list" style={{ maxHeight: '180px' }}>
              {numericCols.map(h => {
                const isChecked = modelFeatures.includes(h);
                return (
                  <label key={h} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', padding: '0.35rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', marginBottom: '0.25rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isChecked} onChange={() => handleFeatureToggle(h)} />
                    {h}
                  </label>
                );
              })}
            </div>
          </div>

          <button 
            type="button" 
            className="btn btn-primary btn-full" 
            style={{ fontSize: '0.85rem' }} 
            onClick={handleTrainModel}
            disabled={isTraining || !modelTarget || modelFeatures.length === 0}
          >
            {isTraining ? '모델 학습 중...' : '모델 학습하기'}
          </button>
        </div>

        <div className="aidu-results-panel">
          {!trainedModel ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', gap: '0.5rem' }}>
              <Brain size={36} />
              <p style={{ fontSize: '0.85rem' }}>변수들을 설정하고 좌측에서 [모델 학습하기]를 누르면 모델 성능 지표가 연산됩니다.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="aidu-card">
                <div className="aidu-card-header">모델 평가 성능 (Train Metrics)</div>
                <div className="aidu-stats-summary">
                  <div className="aidu-summary-item">
                    <div className="aidu-summary-val">{trainedModel.r2.toFixed(4)}</div>
                    <div className="aidu-summary-lbl">R2 Score (설명력)</div>
                  </div>
                  <div className="aidu-summary-item">
                    <div className="aidu-summary-val">{trainedModel.mse.toFixed(2)}</div>
                    <div className="aidu-summary-lbl">MSE (평균제곱오차)</div>
                  </div>
                  <div className="aidu-summary-item">
                    <div className="aidu-summary-val">{trainedModel.coefficients.length}개</div>
                    <div className="aidu-summary-lbl">사용된 피처 개수</div>
                  </div>
                </div>
              </div>

              <div className="aidu-card">
                <div className="aidu-card-header">모델 계수 (Model Coefficients)</div>
                <table className="aidu-table">
                  <thead>
                    <tr>
                      <th>변수명 (Feature)</th>
                      <th>회귀 계수 (Weight)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 'bold' }}>편향 (Bias / Intercept)</td>
                      <td style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{trainedModel.intercept}</td>
                    </tr>
                    {trainedModel.features.map((f, idx) => (
                      <tr key={f}>
                        <td>{f}</td>
                        <td style={{ fontWeight: '600' }}>{trainedModel.coefficients[idx]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAiduModelUseTab = () => {
    if (!trainedModel) {
      return (
        <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', gap: '0.5rem' }}>
          <Cpu size={36} />
          <p style={{ fontSize: '0.85rem' }}>먼저 [AI 모델 학습] 탭에서 회귀 모델 학습을 완료해 주세요.</p>
        </div>
      );
    }

    const handlePredict = () => {
      // Calculate prediction: intercept + sum(val * coeff)
      let sum = trainedModel.intercept;
      for (let i = 0; i < trainedModel.features.length; i++) {
        const feature = trainedModel.features[i];
        const val = Number(predictInputs[feature] || 0);
        sum += val * trainedModel.coefficients[i];
      }
      setPredictionResult(Number(sum.toFixed(4)));
    };

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        <div className="aidu-settings-panel">
          <div className="aidu-section-title">피처 입력값 설정</div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            학습된 수치형 변수들의 값을 입력해 모델 예측값을 생성합니다.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
            {trainedModel.features.map(f => (
              <div key={f} className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.2rem', display: 'block' }}>{f}</label>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', height: '30px' }}
                  placeholder="값 입력..."
                  value={predictInputs[f] || ''}
                  onChange={(e) => {
                    setPredictInputs({
                      ...predictInputs,
                      [f]: e.target.value
                    });
                  }}
                />
              </div>
            ))}
          </div>

          <button 
            type="button" 
            className="btn btn-primary btn-full" 
            style={{ fontSize: '0.85rem', marginTop: '1rem' }} 
            onClick={handlePredict}
          >
            예측값 생성
          </button>
        </div>

        <div className="aidu-results-panel">
          <div className="aidu-card">
            <div className="aidu-card-header">모델 종속 예측 결과</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ backgroundColor: 'var(--bg-main)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 'bold' }}>종속 변수 (Target)</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{trainedModel.target}</span>
              </div>

              {predictionResult !== null ? (
                <div style={{ backgroundColor: 'var(--primary-light)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--primary)', textAlign: 'center', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--primary)', display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>예측 연산 결과값</span>
                  <span style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--primary)' }}>{predictionResult.toLocaleString()}</span>
                </div>
              ) : (
                <div style={{ padding: '1.5rem', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-light)', fontSize: '0.85rem' }}>
                  좌측에서 각 독립 변수의 피처 입력값을 기입한 뒤 [예측값 생성]을 클릭해 주세요.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAiduSettingsTab = () => {
    return (
      <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
        <div className="aidu-card">
          <div className="aidu-card-header">시뮬레이션 환경 설정</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>데이터 캐시 초기화</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>수행 중에 로컬에 저장된 모든 데이터와 변수들을 삭제합니다.</div>
              </div>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                onClick={() => {
                  setUploadedFiles({});
                  setActiveFilename('');
                  setSelectedColumns([]);
                  setAnalysisResults(null);
                  setAiduTab('import');
                  alert('데이터 캐시가 완전히 비워졌습니다.');
                }}
              >
                초기화
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>시뮬레이터 빌드 버젼</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AIDU Web Platform Simulator v1.2 (Standard)</div>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--success)' }}>STABLE</span>
            </div>
          </div>
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
              if (activeFilename && uploadedFiles[activeFilename]) {
                const file = uploadedFiles[activeFilename];
                setSelectedColumns([...file.headers]);
                const N = file.rows.length;
                const defaultStart = Math.round(N * 0.2);
                setDataRangeStart(defaultStart);
                setDataRangeEnd(N);
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
              setDataRangeStart(0);
              setDataRangeEnd(0);
            }}>
              데이터 초기화
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button 
              type="button" 
              className="aidu-topbar-btn" 
              onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              {rightPanelCollapsed ? '문제 보기 ◀' : '문제 접기 ▶'}
            </button>
            <span className="aidu-workspace-info">
              {activeFilename ? `현재 작업데이터: ${activeFilename}` : '현재 작업공간: New_Workspace_AICE_Basic'}
            </span>
          </div>
        </div>

        {/* Workspace Body */}
        <div className="aidu-workspace-body">
          {/* Sidebar */}
          <div className="aidu-sidebar">
            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'home' ? 'active' : ''}`}
              onClick={() => setAiduTab('home')}
            >
              <Home size={16} /> 홈
            </button>
            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'import' ? 'active' : ''}`}
              onClick={() => setAiduTab('import')}
            >
              <UploadCloud size={16} /> 데이터 가져오기
            </button>
            
            {/* 데이터 분석 accordion menu */}
            <button 
              type="button"
              className={`aidu-menu-item ${['describe', 'sample', 'visualize', 'unsupervised'].includes(aiduTab) ? 'active' : ''}`}
              onClick={() => setDataAnalysisExpanded(!dataAnalysisExpanded)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <BarChart2 size={16} /> 데이터 분석
              </span>
              <span style={{ fontSize: '0.65rem' }}>
                {dataAnalysisExpanded ? '▲' : '▼'}
              </span>
            </button>
            
            {dataAnalysisExpanded && (
              <div className="aidu-menu-submenu">
                <button 
                  type="button"
                  className={`aidu-menu-subitem ${aiduTab === 'describe' ? 'active' : ''}`}
                  onClick={() => {
                    if (!activeFilename) {
                      alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                      return;
                    }
                    setAiduTab('describe');
                  }}
                >
                  기초정보분석
                </button>
                <button 
                  type="button"
                  className={`aidu-menu-subitem ${aiduTab === 'visualize' ? 'active' : ''}`}
                  onClick={() => {
                    if (!activeFilename) {
                      alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                      return;
                    }
                    setAiduTab('visualize');
                  }}
                >
                  시각화분석
                </button>
                <button 
                  type="button"
                  className={`aidu-menu-subitem ${aiduTab === 'unsupervised' ? 'active' : ''}`}
                  onClick={() => {
                    if (!activeFilename) {
                      alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                      return;
                    }
                    setAiduTab('unsupervised');
                  }}
                >
                  비지도학습분석
                </button>
                <button 
                  type="button"
                  className={`aidu-menu-subitem ${aiduTab === 'sample' ? 'active' : ''}`}
                  onClick={() => {
                    if (!activeFilename) {
                      alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                      return;
                    }
                    setAiduTab('sample');
                  }}
                >
                  데이터샘플보기
                </button>
              </div>
            )}

            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'preprocess' ? 'active' : ''}`}
              onClick={() => {
                if (!activeFilename) {
                  alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                  return;
                }
                setAiduTab('preprocess');
              }}
            >
              <Database size={16} /> 데이터 가공
            </button>
            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'model_train' ? 'active' : ''}`}
              onClick={() => {
                if (!activeFilename) {
                  alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                  return;
                }
                setAiduTab('model_train');
              }}
            >
              <Brain size={16} /> AI 모델 학습
            </button>
            <button 
              type="button"
              className={`aidu-menu-item ${aiduTab === 'model_use' ? 'active' : ''}`}
              onClick={() => {
                if (!activeFilename) {
                  alert('데이터를 먼저 선택하거나 가져오기 해주세요.');
                  return;
                }
                setAiduTab('model_use');
              }}
            >
              <Cpu size={16} /> AI 모델 활용
            </button>

            {/* Settings at the bottom */}
            <div style={{ marginTop: 'auto' }}>
              <button 
                type="button"
                className={`aidu-menu-item ${aiduTab === 'settings' ? 'active' : ''}`}
                onClick={() => setAiduTab('settings')}
              >
                <Settings size={16} /> 설정
              </button>
            </div>
          </div>

          {/* Main Content Pane */}
          <div className="aidu-main-content">
            {aiduTab === 'home' && renderAiduHomeTab()}
            {aiduTab === 'import' && renderAiduImportTab()}
            {aiduTab === 'describe' && renderAiduDescribeTab()}
            {aiduTab === 'visualize' && renderAiduVisualizeTab()}
            {aiduTab === 'unsupervised' && renderAiduUnsupervisedTab()}
            {aiduTab === 'sample' && renderAiduSampleTab()}
            {aiduTab === 'preprocess' && renderAiduPreprocessTab()}
            {aiduTab === 'model_train' && renderAiduModelTrainTab()}
            {aiduTab === 'model_use' && renderAiduModelUseTab()}
            {aiduTab === 'settings' && renderAiduSettingsTab()}
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
              <h1>{attempt.Exam?.name || 'AICE Basic 모의고사'}</h1>
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
      <main className={`main-layout ${hasAiduData ? 'split-layout-active' : ''} ${rightPanelCollapsed && hasAiduData ? 'right-panel-collapsed' : ''}`}>
        {hasAiduData ? (
          // ==========================================
          // DUAL-PANE SPLIT LAYOUT (AIDU + Quiz)
          // ==========================================
          <>
            {/* Left Pane: AIDU Platform */}
            <section style={{ overflow: 'hidden' }}>
              {renderAiduContainer()}
            </section>

            {/* Right Pane: Quiz Card & Grid */}
            {!rightPanelCollapsed && (
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
            )}
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
