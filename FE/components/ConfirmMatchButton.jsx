import { useState } from 'react';
import { post } from '../api.js';

/**
 * AI 추천 카드의 "내 물건 같아요" 버튼 (원본 ui/common.py 의 _render_confirm_match_control).
 *
 * candidateKind 는 *후보 쪽*의 종류다. 후보가 습득물(found)이면 기준 게시물이
 * 분실물이고, 반대면 그 거울상이다 -- 그래서 lost/found id 를 아래처럼 뒤집어 넣는다.
 *
 * 본인 게시물인지, 이미 매칭됐는지는 서버(db.createMatch)가 다시 판단한다.
 */
export default function ConfirmMatchButton({ candidateKind, candidateId, sourceId, score, onMatched }) {
  const [state, setState] = useState('idle'); // idle | busy | done
  const [error, setError] = useState('');

  const lostPostId = candidateKind === 'found' ? sourceId : candidateId;
  const foundPostId = candidateKind === 'found' ? candidateId : sourceId;

  if (state === 'done') return <span className="status done">매칭 확정</span>;

  async function confirm() {
    setState('busy');
    setError('');
    try {
      await post('/api/matches', { lostPostId, foundPostId, score });
      setState('done');
      onMatched?.();
    } catch (e) {
      setError(e.message);
      setState('idle');
    }
  }

  return (
    <>
      <button className="primary sm" onClick={confirm} disabled={state === 'busy'}>내 물건 같아요</button>
      {error && <span className="faint" style={{ color: 'var(--danger)' }}>{error}</span>}
    </>
  );
}
