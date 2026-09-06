/**
 * 명지도(신뢰도) 표시.
 *
 * 모두 50%에서 시작해 거래를 잘 마치면 오르고, 신고가 인용되면 내려간다.
 * 숫자만 보면 감이 안 오므로 65 이상/45 이상/그 미만을 색으로 나눈다.
 */
export default function TrustScore({ score, showLabel = true }) {
  if (score === null || score === undefined) return null;
  const level = score >= 65 ? 'high' : score >= 45 ? 'mid' : 'low';
  return (
    <span className={`trust trust-${level}`} title="명지도 - 거래를 잘 마칠수록 올라갑니다">
      {showLabel && '명지도 '}{Number(score).toFixed(1)}%
    </span>
  );
}
