export const defaultQuestions = [
  {
    id: 1,
    type: "multiple-choice",
    question: "본 과제(amount.csv 데이터를 이용한 구매 금액 예측) 해결에 가장 알맞은 머신러닝 알고리즘 유형을 고르시오.",
    context: "데이터는 로딩되어 있습니다. 가져오기 하실 필요 없습니다. (amount.csv)",
    options: [
      "회귀모형 (Regression)",
      "분류모형 (Classification)",
      "군집모형 (Clustering)",
      "시계열모형 (Time series)"
    ],
    correctAnswer: 0, // Index of the correct option
    explanation: "구매 금액(amount)은 수치형 연속 데이터입니다. 연속된 수치를 예측하는 문제를 해결하는 데는 '회귀 모형(Regression)'이 적합합니다."
  },
  {
    id: 2,
    type: "multiple-choice",
    question: "Pandas DataFrame에서 각 열(Column)별 결측치(Null/NaN)의 개수를 확인하기 위한 코드로 가장 적절한 것은 무엇인가요?",
    context: "Pandas 라이브러리를 이용하여 데이터의 무결성을 검사하고자 합니다.",
    options: [
      "df.describe()",
      "df.info().count()",
      "df.isnull().sum()",
      "df.dropna()"
    ],
    correctAnswer: 2,
    explanation: "df.isnull()은 각 원소의 결측치 여부를 Boolean으로 반환하며,여기에 .sum()을 연결하면 각 열별 True(결측치)의 합계를 구해줍니다."
  },
  {
    id: 3,
    type: "multiple-choice",
    question: "머신러닝 모델의 성능을 평가하기 위해 전체 데이터를 학습용(Train)과 검증/평가용(Test) 데이터셋으로 분리하는 scikit-learn 함수는 무엇인가요?",
    context: "과적합(Overfitting)을 방지하고 정확한 일반화 성능을 평가하기 위한 단계입니다.",
    options: [
      "sklearn.preprocessing.StandardScaler",
      "sklearn.metrics.accuracy_score",
      "sklearn.model_selection.train_test_split",
      "sklearn.linear_model.LinearRegression"
    ],
    correctAnswer: 2,
    explanation: "sklearn.model_selection 모듈의 train_test_split 함수는 데이터셋을 무작위로 분할하여 학습용과 테스트용 데이터로 나누어 줍니다."
  },
  {
    id: 4,
    type: "short-answer",
    question: "범주형 변수를 머신러닝 모델에 입력할 수 있도록 수치형으로 변환하는 대표적인 인코딩 기법으로, 각 범주 값마다 독립적인 이진(0 또는 1) 피처를 생성하는 변환 기법의 명칭을 입력하시오.",
    context: "예: '요일' 컬럼(월, 화, 수...)을 0과 1로 구성된 다수의 컬럼으로 변환하는 방식",
    placeholder: "예시: 원핫 인코딩 (영어 또는 한글 가능)",
    correctAnswers: [
      "원핫인코딩",
      "원핫 인코딩",
      "원-핫 인코딩",
      "원-핫인코딩",
      "onehotencoding",
      "one hot encoding",
      "one-hot encoding"
    ],
    explanation: "범주형 데이터를 컴퓨터가 이해할 수 있는 0과 1의 이진 벡터로 표현하는 방식을 '원-핫 인코딩(One-Hot Encoding)'이라고 합니다."
  },
  {
    id: 5,
    type: "multiple-choice",
    question: "회귀(Regression) 모델의 설명력을 나타내는 대표적인 성능 평가 지표로, 실제 값의 분산 대비 모델 예측 값의 분산 비율을 기반으로 하며 0과 1 사이(일반적으로)의 값을 가지는 결정계수의 이름은 무엇인가요?",
    context: "설명력이 1에 가까울수록 모델이 실제 데이터의 분포를 완벽하게 설명함을 의미합니다.",
    options: [
      "MSE (Mean Squared Error)",
      "MAE (Mean Absolute Error)",
      "R2 Score (R-squared)",
      "Accuracy"
    ],
    correctAnswer: 2,
    explanation: "결정계수(Coefficient of Determination)는 R2 Score(또는 R-squared)로 부르며, 회귀 모델의 설명력을 측정하는 표준 지표입니다."
  },
  {
    id: 6,
    type: "short-answer",
    question: "수치형 데이터의 변수 값 범위(Scale)가 크게 다를 때 이를 통일해주는 scikit-learn 스케일러 중 하나로, 데이터의 평균을 0, 표준편차를 1이 되도록 표준화하는 클래스 명칭을 영어로 입력하시오.",
    context: "정규분포 형태를 만들어 경사하강법 기반 알고리즘의 학습 속도와 성능을 개선합니다.",
    placeholder: "예시: StandardScaler (대소문자 무관)",
    correctAnswers: [
      "standardscaler",
      "standard scaler"
    ],
    explanation: "평균을 0, 분산(표준편차)을 1로 표준화하는 대표 스케일러는 'StandardScaler'입니다."
  },
  {
    id: 7,
    type: "multiple-choice",
    question: "다음 중 '회귀 분석(Regression)' 용도로 설계된 머신러닝 모델이 아닌 것을 고르시오.",
    context: "scikit-learn 라이브러리에서 지원하는 주요 모델들입니다.",
    options: [
      "LinearRegression",
      "DecisionTreeRegressor",
      "RandomForestRegressor",
      "LogisticRegression"
    ],
    correctAnswer: 3,
    explanation: "LogisticRegression(로지스틱 회귀)은 이름에 회귀가 포함되어 있으나, 실질적으로 분류(Classification) 알고리즘에 해당하며 시그모이드 함수를 사용하여 분류 확률을 예측합니다."
  },
  {
    id: 8,
    type: "multiple-choice",
    question: "학습이 완료된 scikit-learn 모델 객체(예: `model`)를 사용하여 새로운 평가용 데이터(X_test)에 대한 타겟 값을 추정하고 예측 데이터를 얻을 때 호출하는 메서드는 무엇인가요?",
    context: "학습 시에는 model.fit(X_train, y_train)을 사용했습니다.",
    options: [
      "model.evaluate(X_test)",
      "model.predict(X_test)",
      "model.score(X_test)",
      "model.transform(X_test)"
    ],
    correctAnswer: 1,
    explanation: "scikit-learn에서 학습 완료된 모델을 통해 실제 예측값을 도출하는 메서드는 `predict`입니다."
  },
  {
    id: 9,
    type: "short-answer",
    question: "실제값과 예측값의 편차(오차) 제곱의 평균에 루트(제곱근)를 씌운 회귀 평가 지표의 약자를 영문 4글자로 작성하시오.",
    context: "MSE에 루트를 적용하여 오차의 단위를 실제 종속 변수(amount 등) 단위와 동일하게 맞춘 지표입니다.",
    placeholder: "예시: ABCD (대소문자 무관)",
    correctAnswers: [
      "rmse"
    ],
    explanation: "Root Mean Squared Error의 약자는 'RMSE'입니다."
  },
  {
    id: 10,
    type: "multiple-choice",
    question: "모델이 훈련용 데이터(Train data)에만 지나치게 최적화되어 실제 예측을 수행해야 하는 테스트 데이터(Test data)에서는 오차가 커지고 일반화 성능이 현저히 떨어지는 현상을 무엇이라고 하나요?",
    context: "복잡한 모델 구조를 사용하거나 에포크(Epoch)를 너무 많이 수행했을 때 발생하기 쉽습니다.",
    options: [
      "과소적합 (Underfitting)",
      "과적합 / 과대적합 (Overfitting)",
      "정규화 (Regularization)",
      "특성 선택 (Feature Selection)"
    ],
    correctAnswer: 1,
    explanation: "학습 데이터에만 지나치게 맞춰져 모델 유연성이 과도하게 높아진 결과, 평가 데이터에서 설명력이 떨어지는 문제를 '과적합(Overfitting)'이라고 합니다."
  },
  {
    id: 11,
    type: "multiple-choice",
    question: "모델을 통한 예측 결과, 테스트 데이터의 실제 종속변수 'amount'(구매 금액)의 평균이 25,000원이고 RMSE(평균 제곱근 오차)가 2,500원으로 계산되었습니다. 이 모델의 대략적인 오차 비율(RMSE / 평균)은 몇 %에 해당하는지 고르시오.",
    context: "모델 예측 값의 대략적인 오차 수준을 백분율로 해석하기 위한 수식입니다.",
    options: [
      "1%",
      "5%",
      "10%",
      "25%"
    ],
    correctAnswer: 2,
    explanation: "RMSE(2,500원)는 평균값(25,000원)의 10%에 해당하므로, 예측 오차 수준은 대략 10% 정도로 판단해볼 수 있습니다."
  }
];
