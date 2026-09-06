import { useState } from 'react';

/**
 * 게시물 대표 사진.
 * 파일이 없거나 깨졌으면 조용히 사라진다 -- 이미지 하나 때문에 목록 전체 렌더링이
 * 멈추지 않게 하려는 것으로, 원본 ui/common.py 의 render_post_thumbnail 과 같은 정책이다.
 *
 * count 를 넘기면 사진이 2장 이상일 때 오른쪽 아래에 "+N" 을 얹어, 목록에서도
 * 사진이 더 있다는 걸 알 수 있게 한다.
 */
export default function Thumb({ src, count = 0, className = 'thumb' }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;

  const extra = count > 1 ? count - 1 : 0;
  return (
    <div className="thumb-wrap">
      <img className={className} src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      {extra > 0 && <span className="thumb-more">+{extra}</span>}
    </div>
  );
}
