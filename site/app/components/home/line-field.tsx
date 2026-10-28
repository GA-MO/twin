import { useEffect, useRef } from 'react';

const VERTEX = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform float uTime;
uniform float uLight;
out vec4 color;

vec3 rainbow(float t) {
  vec3 stops[7] = vec3[7](
    vec3(1.0, 0.37, 0.43), vec3(1.0, 0.70, 0.28), vec3(0.98, 0.89, 0.36),
    vec3(0.33, 0.84, 0.54), vec3(0.31, 0.70, 1.0), vec3(0.54, 0.42, 1.0), vec3(0.90, 0.42, 0.84)
  );
  float x = clamp(t, 0.0, 0.9999) * 6.0;
  int i = int(floor(x));
  return mix(stops[i], stops[i + 1], fract(x));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float px = 1.0 / uSize.y;
  float x = uv.x;
  float center = 0.22 + 0.42 * x + 0.06 * sin(x * 3.2 + uTime * 0.22);
  float spread = 0.03 + 0.3 * smoothstep(0.0, 1.0, x) * (0.8 + 0.2 * sin(uTime * 0.17 + x * 2.3));
  vec3 sum = vec3(0.0);
  float alpha = 0.0;
  for (int i = 0; i < 30; i++) {
    float k = float(i) / 29.0;
    float y = center + spread * (k - 0.5) + 0.01 * sin(x * 8.0 + uTime * 0.5 + k * 11.0);
    float d = abs(uv.y - y);
    float line = 0.85 * smoothstep(px * 1.3, 0.0, d) + 0.22 * smoothstep(px * 12.0, 0.0, d);
    float travel = fract(x * 0.8 - uTime * 0.06 + k * 0.61);
    float pulse = 0.3 + 0.7 * pow(sin(travel * 3.14159), 6.0);
    vec3 hue = rainbow(fract(k * 0.85 + x * 0.2 - uTime * 0.025));
    float a = line * pulse * (0.35 + 0.35 * (1.0 - abs(k - 0.5) * 2.0));
    sum += hue * a;
    alpha += a;
  }
  float fade = smoothstep(0.0, 0.22, x) * smoothstep(1.0, 0.82, x) * mix(0.14, 1.0, smoothstep(0.34, 0.47, x));
  alpha = clamp(alpha * fade * mix(1.0, 1.6, uLight), 0.0, 1.0);
  color = vec4(clamp(sum * fade * mix(1.0, 1.05, uLight), 0.0, 1.0) * mix(1.0, 0.72, uLight), alpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

export function LineField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!canvas || !gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uSize = gl.getUniformLocation(program, 'uSize');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uLight = gl.getUniformLocation(program, 'uLight');

    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    let frame = 0;
    const started = performance.now();

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = (now: number) => {
      gl.uniform2f(uSize, canvas.width, canvas.height);
      gl.uniform1f(uTime, still.matches ? 12 : (now - started) / 1000);
      gl.uniform1f(uLight, document.documentElement.classList.contains('dark') ? 0 : 1);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      draw(now);
      frame = visible && !still.matches && !document.hidden ? requestAnimationFrame(loop) : 0;
    };

    const wake = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };

    const sizer = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    sizer.observe(canvas);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) wake();
    });
    seen.observe(canvas);
    const theme = new MutationObserver(() => draw(performance.now()));
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', wake);
    still.addEventListener('change', wake);
    resize();
    canvas.dataset.ready = 'true';
    wake();

    return () => {
      cancelAnimationFrame(frame);
      sizer.disconnect();
      seen.disconnect();
      theme.disconnect();
      document.removeEventListener('visibilitychange', wake);
      still.removeEventListener('change', wake);
    };
  }, []);

  return <canvas ref={ref} className="home-lines" aria-hidden />;
}
