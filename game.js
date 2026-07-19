(function () {
  'use strict';

  const canvas = document.getElementById('drawingCanvas');
  const context = canvas.getContext('2d');
  const drawingApp = document.getElementById('drawingApp');
  const instruction = document.getElementById('instruction');
  const result = document.getElementById('result');
  const resetButton = document.getElementById('resetButton');
  let drawing = false;
  let morphing = false;
  let hasDrawn = false;
  let strokePoints = [];
  let shapes = [];
  let animationFrame;

  function resizeCanvas() {
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * pixelRatio);
    canvas.height = Math.floor(window.innerHeight * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 9;
    context.strokeStyle = '#f8fafc';
  }

  function pointFromEvent(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function resampleStroke(points, count) {
    if (points.length < 2) return Array.from({ length: count }, () => ({ ...points[0] }));
    const lengths = [0];
    for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
    const total = lengths[lengths.length - 1];
    return Array.from({ length: count }, (_, index) => {
      const wanted = total * index / (count - 1);
      let segment = 1;
      while (segment < lengths.length - 1 && lengths[segment] < wanted) segment += 1;
      const start = points[segment - 1];
      const end = points[segment];
      const span = lengths[segment] - lengths[segment - 1] || 1;
      const ratio = (wanted - lengths[segment - 1]) / span;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    });
  }

  function addBezier(points, start, controlA, controlB, end, steps) {
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const inverse = 1 - t;
      points.push({
        x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
        y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y
      });
    }
  }

  function targetLinePoints(count) {
    const minX = Math.min(...strokePoints.map((point) => point.x));
    const maxX = Math.max(...strokePoints.map((point) => point.x));
    const minY = Math.min(...strokePoints.map((point) => point.y));
    const maxY = Math.max(...strokePoints.map((point) => point.y));
    const sourceWidth = Math.max(maxX - minX, 12);
    const sourceHeight = Math.max(maxY - minY, 12);
    const pathMinX = .05;
    const pathMaxX = .98;
    const pathMinY = -.08;
    const pathMaxY = 1.02;
    const unitX = sourceWidth / (pathMaxX - pathMinX);
    const unitY = sourceHeight / (pathMaxY - pathMinY);
    const left = minX - pathMinX * unitX;
    const top = minY - pathMinY * unitY;
    const points = [];
    const p = (x, y) => ({ x: left + x * unitX, y: top + y * unitY });

    // A single continuous hand-drawn path for 6, followed by 7.
    addBezier(points, p(.42, .02), p(.27, -.08), p(.08, .10), p(.05, .45), 32);
    addBezier(points, p(.05, .45), p(.00, .82), p(.18, 1.02), p(.40, .88), 30);
    addBezier(points, p(.40, .88), p(.60, .74), p(.52, .48), p(.34, .48), 26);
    addBezier(points, p(.34, .48), p(.16, .48), p(.06, .60), p(.10, .77), 22);
    points.push(p(.10, .77), p(.72, .08), p(.98, .08), p(.63, 1.00));
    return resampleStroke(points, count);
  }

  function beginMorph() {
    const count = 520;
    const starts = resampleStroke(strokePoints, count);
    const targets = targetLinePoints(count);
    shapes.push({
      source: strokePoints.slice(),
      particles: starts.map((start, index) => ({ x: start.x, y: start.y, start, target: targets[index] })),
      startedAt: performance.now()
    });
    morphing = true;
    result.hidden = true;
    instruction.hidden = true;
    drawingApp.style.cursor = 'default';
    if (!animationFrame) animationFrame = requestAnimationFrame(animateMorph);
  }

  function drawShape(shape, progress) {
    const eased = 1 - Math.pow(1 - progress, 3);
    context.beginPath();
    shape.particles.forEach((particle, index) => {
      particle.x = particle.start.x + (particle.target.x - particle.start.x) * eased;
      particle.y = particle.start.y + (particle.target.y - particle.start.y) * eased;
      if (index === 0) context.moveTo(particle.x, particle.y); else context.lineTo(particle.x, particle.y);
    });
    context.strokeStyle = '#f8fafc';
    context.lineWidth = 9;
    context.stroke();
  }

  function animateMorph(timestamp) {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let anyMoving = false;
    shapes.forEach((shape) => {
      const progress = Math.min((timestamp - shape.startedAt) / 1400, 1);
      drawShape(shape, progress);
      if (progress < 1) anyMoving = true;
    });
    if (anyMoving) animationFrame = requestAnimationFrame(animateMorph);
    else { animationFrame = null; morphing = false; result.hidden = false; }
  }

  canvas.addEventListener('mousedown', function (event) {
    if (morphing || event.button !== 0) return;
    drawing = true;
    strokePoints = [pointFromEvent(event)];
    context.beginPath();
    context.moveTo(strokePoints[0].x, strokePoints[0].y);
    event.preventDefault();
  });

  canvas.addEventListener('mousemove', function (event) {
    if (!drawing) return;
    const point = pointFromEvent(event);
    strokePoints.push(point);
    context.lineTo(point.x, point.y);
    context.stroke();
    hasDrawn = true;
    event.preventDefault();
  });

  function finishDrawing() {
    if (!drawing) return;
    drawing = false;
    if (strokePoints.length > 1) beginMorph();
  }

  canvas.addEventListener('mouseup', finishDrawing);
  canvas.addEventListener('mouseleave', finishDrawing);

  resetButton.addEventListener('click', function () {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    result.hidden = true;
    instruction.hidden = false;
    drawingApp.style.cursor = 'crosshair';
    drawing = false;
    morphing = false;
    hasDrawn = false;
    strokePoints = [];
    shapes = [];
  });

  window.addEventListener('resize', function () {
    if (!hasDrawn && !morphing) resizeCanvas();
  });

  resizeCanvas();
}());
