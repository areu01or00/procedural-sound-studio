// Shared delivery fixtures for tests. RENDERER is a real tiny renderer: it reads
// score.svg, adds one sine per data-audible mark, writes silence when none
// remain, and guards peak normalisation against division by zero. Deliveries are
// checked by the real silence test; nothing disables it.
export const RENDERER = `from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np, soundfile as sf
here = Path(__file__).resolve().parent
marks = [n for n in ET.parse(here / "score.svg").getroot().iter() if n.get("data-audible") not in (None, "false")]
t = np.arange(8000) / 8000.0
mix = np.zeros(8000)
for i, node in enumerate(marks):
    pts = node.get("points") or node.get("d") or ""
    mix += 0.2 * np.sin(2 * np.pi * (220 + 40 * i + len(pts) % 13) * t)
peak = float(np.max(np.abs(mix)))
mix = mix / peak * 0.5 if peak > 0 else mix
sf.write(here / "audio.wav", mix.astype("float32"), 8000, subtype="FLOAT")
`;

export function wav(amplitude = 5000, frequency = 440) {
  const b = Buffer.alloc(1644);
  b.write('RIFF', 0); b.writeUInt32LE(1636, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(1600, 40);
  for (let i = 0; i < 800; i++) b.writeInt16LE(Math.round(amplitude * Math.sin(2 * Math.PI * frequency * i / 8000)), 44 + i * 2);
  return b;
}
