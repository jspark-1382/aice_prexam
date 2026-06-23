import { memo } from 'react';

// ─── 공통 스타일 상수 ───────────────────────────────────────────
const S = {
  sectionTitle: {
    fontSize: '11px', 
    fontWeight: '700', 
    color: '#5e6c84',
    marginBottom: '6px', 
    textTransform: 'uppercase', 
    letterSpacing: '0.04em'
  },
  table: { 
    borderCollapse: 'collapse', 
    fontSize: '12px', 
    width: 'auto' 
  },
  th: {
    borderBottom: '1px solid #dfe1e6', 
    color: '#5e6c84',
    fontWeight: '600', 
    fontSize: '11px', 
    whiteSpace: 'nowrap',
    padding: '6px 8px'
  },
  thL: { textAlign: 'left', paddingLeft: 0 },
  thR: { textAlign: 'right', paddingRight: 0 },
  thM: { textAlign: 'right' },
  td: { 
    borderBottom: '1px solid #dfe1e6', 
    whiteSpace: 'nowrap',
    padding: '6px 8px'
  },
  tdL: { color: '#5e6c84', paddingLeft: 0 },
  tdR: { textAlign: 'right', paddingRight: 0 },
  tdM: { textAlign: 'right' },
  tdMuted: { textAlign: 'right', color: '#5e6c84' },
};

// ─── 통합 미니 테이블 ────────────────────────────────────────────
function MiniTable({ headers, rows }) {
  return (
    <table style={S.table}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{ ...S.th, ...(i === 0 ? S.thL : i === headers.length - 1 ? S.thR : S.thM) }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => {
              const isFirst = ci === 0;
              const isLast = ci === row.length - 1;
              const isMiddle = !isFirst && !isLast;
              return (
                <td
                  key={ci}
                  style={{
                    ...S.td,
                    ...(isFirst ? S.tdL : isLast && row.length === 2 ? S.tdR : isMiddle ? S.tdM : S.tdMuted),
                    ...(cell?.style || {})
                  }}
                  title={cell?.title}
                >
                  {cell?.value ?? cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── SVG 히스토그램 (numeric) ───────────────────────────────────
function Histogram({ bars }) {
  const maxCnt = Math.max(...bars.map(b => b.count), 1);
  const W = 220, H = 82, pL = 20, pB = 16, pT = 6, pR = 4;
  const cW = W - pL - pR, cH = H - pT - pB;
  const bSp = cW / bars.length, bW = Math.max(bSp - 1.5, 2.5);
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
      <line x1={pL} y1={pT} x2={pL} y2={pT + cH} stroke="#dfe1e6" strokeWidth="1" />
      <line x1={pL} y1={pT + cH} x2={pL + cW} y2={pT + cH} stroke="#dfe1e6" strokeWidth="1" />
      {[0, Math.ceil(maxCnt / 2), maxCnt].map(v => {
        const y = pT + cH - (v / maxCnt) * cH;
        return (
          <g key={v}>
            <line x1={pL - 2} y1={y} x2={pL} y2={y} stroke="#dfe1e6" strokeWidth="1" />
            <text x={pL - 4} y={y} textAnchor="end" dominantBaseline="middle" fontSize="5.5" fill="#7a869a">{v}</text>
          </g>
        );
      })}
      {bars.map((bar, i) => {
        const bH = Math.max((bar.count / maxCnt) * cH, 1);
        const bX = pL + i * bSp + (bSp - bW) / 2, bY = pT + cH - bH;
        const lbl = String(bar.label).length > 5 ? String(bar.label).slice(0, 4) + '…' : String(bar.label);
        return (
          <g key={i}>
            <rect x={bX} y={bY} width={bW} height={bH} fill="#0052cc" opacity="0.85" rx="1">
              <title>{bar.label}: {bar.count}개 ({bar.percentage}%)</title>
            </rect>
            <text x={bX + bW / 2} y={pT + cH + 7} textAnchor="middle" fontSize="5" fill="#7a869a"
              transform={`rotate(-20 ${bX + bW / 2} ${pT + cH + 7})`}>{lbl}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── SVG 수평 바차트 (object) ────────────────────────────────────
function HBarChart({ bars }) {
  const maxCnt = Math.max(...bars.map(b => b.count), 1);
  const rowH = 13, W = 230, pL = 58, pR = 28, pT = 2, aW = W - pL - pR;
  const svgH = bars.length * rowH + pT + 4;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${svgH}`} preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
      {bars.map((bar, i) => {
        const bW = Math.max((bar.count / maxCnt) * aW, 2);
        const y = pT + i * rowH;
        const lbl = String(bar.label).length > 9 ? String(bar.label).slice(0, 8) + '…' : String(bar.label);
        return (
          <g key={i}>
            <text x={pL - 4} y={y + rowH / 2} textAnchor="end" dominantBaseline="middle" fontSize="6.5" fill="#172b4d" fontWeight="500">{lbl}</text>
            <rect x={pL} y={y + 2} width={bW} height={rowH - 4} fill="#0052cc" opacity="0.85" rx="1.5">
              <title>{bar.label}: {bar.count}개 ({bar.percentage}%)</title>
            </rect>
            <text x={pL + bW + 3} y={y + rowH / 2} dominantBaseline="middle" fontSize="6.5" fill="#7a869a">{bar.count}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── 최빈값 테이블 ───────────────────────────────────────────────
function FreqTable({ items }) {
  return (
    <MiniTable
      headers={['값', '빈도', '비율']}
      rows={items.map(item => [
        { value: item.value === '' ? '(empty)' : item.value, style: { maxWidth: '85px', overflow: 'hidden', textOverflow: 'ellipsis' }, title: item.value },
        item.count,
        { value: item.percentage, style: { color: '#5e6c84' } }
      ])}
    />
  );
}

// ─── 메인 컬럼 카드 컴포넌트 ─────────────────────────────────────
function ColumnCard({ colName, col }) {
  const isNumeric = col.type === 'int64' || col.type === 'float64';

  const cardHeaderStyle = {
    display: 'flex', 
    alignItems: 'center', 
    gap: '0.4rem',
    marginBottom: '0.6rem', 
    paddingBottom: '0.4rem',
    borderBottom: '1px solid #dfe1e6'
  };
  
  const badgeStyle = {
    fontSize: '11px', 
    padding: '2px 6px', 
    borderRadius: '3px',
    fontFamily: 'monospace',
    backgroundColor: col.type === 'float64' ? '#deebff' : col.type === 'int64' ? '#e2f0d9' : '#f4f5f7',
    color: col.type === 'float64' ? '#0747a6' : col.type === 'int64' ? '#385723' : '#5e6c84',
    fontWeight: '600',
    display: 'inline-block',
    whiteSpace: 'nowrap'
  };

  return (
    <div className="aidu-card" style={{ 
      padding: '12px 16px', 
      marginBottom: '12px', 
      border: '1px solid #dfe1e6', 
      borderRadius: '4px', 
      backgroundColor: '#ffffff', 
      boxShadow: 'none' 
    }}>
      {/* 헤더 */}
      <div style={cardHeaderStyle}>
        <span style={{ fontWeight: '700', fontSize: '13px', color: '#172b4d' }}>{colName}</span>
        <span style={badgeStyle}>{col.type}</span>
      </div>

      {isNumeric ? (
        /* ── numeric: 좌측 통계 | 우측 히스토그램 (align-items: stretch) ── */
        <div style={{ display: 'flex', gap: '24px', alignItems: 'stretch' }}>
          
          {/* 좌측: 통계 정보 그룹 (flex-shrink: 0, text wrap 방지) */}
          <div style={{ display: 'flex', gap: '16px', flexShrink: 0, flexWrap: 'nowrap' }}>
            
            {/* 1. 기술통계 (분할 미니 테이블) */}
            <div style={{ flexShrink: 0 }}>
              <div style={S.sectionTitle}>기술통계 (Describe)</div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <MiniTable
                  headers={['항목', '값']}
                  rows={[
                    ['size', col.size], ['distinct', col.distinct], ['distinct(%)', col.distinctPct],
                    ['missing', col.missing], ['missing(%)', col.missingPct]
                  ]}
                />
                <MiniTable
                  headers={['항목', '값']}
                  rows={[
                    ['zeros', col.zeros], ['zeros(%)', col.zerosPct],
                    ['mean', col.mean], ['median', col.median], ['sd', col.sd]
                  ]}
                />
              </div>
            </div>

            {/* 2. 분위수 */}
            {col.quantiles && (
              <div style={{ flexShrink: 0 }}>
                <div style={S.sectionTitle}>분위수</div>
                <MiniTable
                  headers={['항목', '값']}
                  rows={[
                    ['min', col.quantiles.min], ['q1', col.quantiles.q1],
                    ['median', col.quantiles.median], ['q3', col.quantiles.q3],
                    ['max', col.quantiles.max]
                  ]}
                />
              </div>
            )}

            {/* 3. 최빈값 */}
            {col.topFrequencies && (
              <div style={{ flexShrink: 0 }}>
                <div style={S.sectionTitle}>최빈값 (Top 5)</div>
                <FreqTable items={col.topFrequencies} />
              </div>
            )}

          </div>

          {/* 우측: 시각화 히스토그램 (부모 영역을 가득 채움) */}
          <div style={{ flexGrow: 1, width: 0, minWidth: 0, borderLeft: '1px solid #dfe1e6', paddingLeft: '24px', display: 'flex', flexDirection: 'column' }}>
            <div style={S.sectionTitle}>히스토그램</div>
            <div style={{ position: 'relative', flexGrow: 1, height: '100%', width: '100%' }}>
              {col.chartData && <Histogram bars={col.chartData} />}
            </div>
          </div>

        </div>
      ) : (
        /* ── object: 좌측 통계 | 우측 바차트 ── */
        <div style={{ display: 'flex', gap: '24px', alignItems: 'stretch' }}>
          
          {/* 좌측: 통계 정보 그룹 (flex-shrink: 0) */}
          <div style={{ display: 'flex', gap: '16px', flexShrink: 0, flexWrap: 'nowrap' }}>
            
            {/* 1. 기술통계 */}
            <div style={{ flexShrink: 0 }}>
              <div style={S.sectionTitle}>기술통계</div>
              <MiniTable
                headers={['항목', '값']}
                rows={[
                  ['size', col.size], ['distinct', col.distinct], ['distinct(%)', col.distinctPct],
                  ['missing', col.missing], ['missing(%)', col.missingPct]
                ]}
              />
            </div>

            {/* 2. 최빈값 */}
            {col.topFrequencies && (
              <div style={{ flexShrink: 0 }}>
                <div style={S.sectionTitle}>최빈값 (Top 5)</div>
                <FreqTable items={col.topFrequencies} />
              </div>
            )}

          </div>

          {/* 우측: 시각화 바차트 */}
          <div style={{ flexGrow: 1, width: 0, minWidth: 0, borderLeft: '1px solid #dfe1e6', paddingLeft: '24px', display: 'flex', flexDirection: 'column' }}>
            <div style={S.sectionTitle}>바차트</div>
            <div style={{ position: 'relative', flexGrow: 1, height: '100%', width: '100%' }}>
              {col.chartData && <HBarChart bars={col.chartData} />}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

export default memo(ColumnCard);
