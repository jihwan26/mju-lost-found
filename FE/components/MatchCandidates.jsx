import { navigate } from '../navigation.js';
import Thumb from './Thumb.jsx';
import ConfirmMatchButton from './ConfirmMatchButton.jsx';

/**
 * AI 결과 카드 목록 (원본 ui/common.py 의 render_match_candidates).
 *
 * kind: 후보 게시물들의 종류('lost' | 'found'). 어느 쪽 라벨/날짜 필드를 쓸지 정한다.
 * sourcePostId: 후보들을 비교한 기준 게시물의 id. 주어지면 각 카드에
 *   "내 물건 같아요"(매칭 확정) 버튼이 붙는다. 자유 문장 AI 검색처럼
 *   짝지을 기준 게시물이 없는 경우에는 생략된다.
 */
export default function MatchCandidates({ kind, results, sourcePostId, onMatched }) {
  const dateField = kind === 'found' ? 'found_at' : 'lost_at';
  const dateLabel = kind === 'found' ? '습득 시간' : '분실 시간';
  const boardLabel = kind === 'found' ? '찾았어요' : '찾아요';

  return (
    <div className="list">
      {results.map(({ post: p, score }) => (
        <div className="list-item" key={`${kind}-${p.id}`}>
          <Thumb src={p.images?.[0]} count={p.images?.length} />
          <div className="list-body">
            <p className="item-title">
              <span className="tag accent" style={{ marginRight: 7 }}>{boardLabel}</span>
              {p.title}
            </p>
            <p className="meta">
              {p.category}<span className="sep">·</span>{p.location}
              <span className="sep">·</span>{dateLabel} {p[dateField]}
            </p>
            <p className="desc">{p.description}</p>
            <p className="faint mono-score" style={{ marginTop: 6 }}>
              유사도 {score.toFixed(2)}<span className="sep">·</span>{p.author_nickname}
            </p>
          </div>
          <div className="list-actions">
            <button className="sm" onClick={() => navigate(`/${kind}/${p.id}`)}>상세보기</button>
            {sourcePostId != null && (
              <ConfirmMatchButton
                candidateKind={kind}
                candidateId={p.id}
                sourceId={sourcePostId}
                score={score}
                onMatched={onMatched}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
