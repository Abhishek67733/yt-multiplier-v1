"use client";

const LETTERS = ["Y", "T", " ", "M", "u", "l", "t", "i", "p", "l", "i", "e", "r"];

export default function AnimatedLogo() {
  return (
    <>
      <style>{`
        .logo-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 40px;
          width: auto;
          font-family: "Poppins", sans-serif;
          font-size: 1.1em;
          font-weight: 700;
          user-select: none;
          color: #fff;
        }
        .logo-overlay {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 100%;
          z-index: 1;
          background-color: transparent;
          mask: repeating-linear-gradient(
            90deg,
            transparent 0,
            transparent 4px,
            black 5px,
            black 6px
          );
          -webkit-mask: repeating-linear-gradient(
            90deg,
            transparent 0,
            transparent 4px,
            black 5px,
            black 6px
          );
        }
        .logo-overlay::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-image: radial-gradient(circle at 50% 50%, #ff0 0%, transparent 50%),
            radial-gradient(circle at 45% 45%, #f00 0%, transparent 45%),
            radial-gradient(circle at 55% 55%, #0ff 0%, transparent 45%),
            radial-gradient(circle at 45% 55%, #0f0 0%, transparent 45%),
            radial-gradient(circle at 55% 45%, #00f 0%, transparent 45%);
          mask: radial-gradient(
            circle at 50% 50%,
            transparent 0%,
            transparent 10%,
            black 25%
          );
          -webkit-mask: radial-gradient(
            circle at 50% 50%,
            transparent 0%,
            transparent 10%,
            black 25%
          );
          animation:
            logo-transform 2s infinite alternate cubic-bezier(0.6, 0.8, 0.5, 1),
            logo-opacity 4s infinite cubic-bezier(0.6, 0.8, 0.5, 1);
        }
        @keyframes logo-transform {
          0% { transform: translate(-55%); }
          100% { transform: translate(55%); }
        }
        @keyframes logo-opacity {
          0%, 100% { opacity: 0; }
          15% { opacity: 1; }
          65% { opacity: 0; }
        }
        .logo-letter {
          display: inline-block;
          opacity: 0;
          animation: logo-letter-anim 4s infinite linear;
          z-index: 2;
        }
        @keyframes logo-letter-anim {
          0% { opacity: 0; }
          5% {
            opacity: 1;
            text-shadow: 0 0 4px #fff;
            transform: scale(1.1) translateY(-1px);
          }
          20% { opacity: 0.2; }
          100% { opacity: 0; }
        }
      `}</style>
      <div className="logo-wrapper">
        {LETTERS.map((letter, i) => (
          <span
            key={i}
            className="logo-letter"
            style={{
              animationDelay: `${(i * 0.105 + 0.1).toFixed(3)}s`,
              width: letter === " " ? "6px" : undefined,
            }}
          >
            {letter === " " ? "\u00A0" : letter}
          </span>
        ))}
        <div className="logo-overlay" />
      </div>
    </>
  );
}
