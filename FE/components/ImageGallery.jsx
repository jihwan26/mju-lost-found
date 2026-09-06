import { useState } from 'react';

/**
 * 게시물 사진 갤러리(최대 3장).
 * 사진이 1장이면 그냥 한 장만 보여주고, 여러 장이면 아래에 작은 썸네일을 깔아
 * 눌러서 바꿔 보게 한다. 깨진 사진은 조용히 건너뛴다.
 */
export default function ImageGallery({ images }) {
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState(() => new Set());

  const usable = (images || []).filter((src) => !broken.has(src));
  if (!usable.length) return null;
  const current = usable[Math.min(index, usable.length - 1)];

  return (
    <div className="gallery">
      <img
        className="detail-image"
        src={current}
        alt=""
        onError={() => setBroken((prev) => new Set(prev).add(current))}
      />
      {usable.length > 1 && (
        <div className="gallery-thumbs">
          {usable.map((src, i) => (
            <button
              key={src}
              type="button"
              className={`gallery-thumb ${src === current ? 'active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`사진 ${i + 1}`}
            >
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
