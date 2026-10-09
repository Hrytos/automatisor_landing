/**
 * Source map component — draws circuit-trace connector lines between the
 * central hub and each surrounding source pill, then animates a colored
 * pulse traveling outward along each line (desynced per line). Positions
 * are measured from the live layout so it stays correct on resize.
 */
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CORNER_RADIUS = 14;
  const STUB_LENGTH = 26; // short straight run near the hub before a corner turn
  const DASH_FRACTION = 0.22; // portion of the path length that glows
  const BASE_DURATION_MS = 2600;
  const DURATION_JITTER_MS = 1200;

  function point(x, y) {
    return { x, y };
  }

  function edgePoint(rect, containerRect, side) {
    const x = rect.left - containerRect.left;
    const y = rect.top - containerRect.top;
    switch (side) {
      case 'top': return point(x + rect.width / 2, y);
      case 'bottom': return point(x + rect.width / 2, y + rect.height);
      case 'left': return point(x, y + rect.height / 2);
      case 'right': return point(x + rect.width, y + rect.height / 2);
      default: return point(x + rect.width / 2, y + rect.height / 2);
    }
  }

  // Anchor point where a given direction's line leaves the hub. The 4 corner
  // directions each get their own point along the hub's top/bottom edge
  // (instead of all sharing the exact center), so lines fan out and don't
  // overlap right at the source.
  const HUB_EDGE_OFFSET_FRACTION = 0.5;

  function hubAnchorPoint(hubRect, containerRect, pos) {
    const x = hubRect.left - containerRect.left;
    const y = hubRect.top - containerRect.top;
    const cx = x + hubRect.width / 2;
    const cy = y + hubRect.height / 2;
    const dx = (hubRect.width / 2) * HUB_EDGE_OFFSET_FRACTION;
    const dy = (hubRect.height / 2) * HUB_EDGE_OFFSET_FRACTION;

    switch (pos) {
      case 'n': return point(cx, y);
      case 's': return point(cx, y + hubRect.height);
      case 'w': return point(x, cy);
      case 'e': return point(x + hubRect.width, cy);
      case 'nw': return point(cx - dx, y);
      case 'ne': return point(cx + dx, y);
      case 'sw': return point(cx - dx, y + hubRect.height);
      case 'se': return point(cx + dx, y + hubRect.height);
      default: return point(cx, cy);
    }
  }

  function straightPath(a, b) {
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }

  // Two-corner "staircase" route: a short stub straight out of the hub, a
  // horizontal jog, then a run into the node — matches the reference
  // circuit-trace layout. Direction is derived purely from the two points,
  // so this same routine handles all four corners (nw/ne/sw/se).
  function elbowPath(hub, node) {
    const r = CORNER_RADIUS;
    const vSign = Math.sign(node.y - hub.y) || 1;
    const hSign = Math.sign(node.x - hub.x) || 1;
    const midY = hub.y + vSign * STUB_LENGTH;

    const beforeCorner1 = point(hub.x, midY - vSign * r);
    const afterCorner1 = point(hub.x + hSign * r, midY);
    const beforeCorner2 = point(node.x - hSign * r, midY);
    const afterCorner2 = point(node.x, midY + vSign * r);

    return [
      `M ${hub.x} ${hub.y}`,
      `L ${beforeCorner1.x} ${beforeCorner1.y}`,
      `Q ${hub.x} ${midY} ${afterCorner1.x} ${afterCorner1.y}`,
      `L ${beforeCorner2.x} ${beforeCorner2.y}`,
      `Q ${node.x} ${midY} ${afterCorner2.x} ${afterCorner2.y}`,
      `L ${node.x} ${node.y}`
    ].join(' ');
  }

  // Mirror of elbowPath with the horizontal/vertical roles swapped: a short
  // stub straight out of the hub's left edge, a vertical jog, then a run
  // into the node's right edge. Used for the stacked mobile layout, where
  // every node sits to the left of the hub instead of around it.
  function elbowPathHorizontal(hub, node) {
    const r = CORNER_RADIUS;
    const hSign = Math.sign(node.x - hub.x) || 1;
    const vSign = Math.sign(node.y - hub.y) || 1;
    const midX = hub.x + hSign * STUB_LENGTH;

    const beforeCorner1 = point(midX - hSign * r, hub.y);
    const afterCorner1 = point(midX, hub.y + vSign * r);
    const beforeCorner2 = point(midX, node.y - vSign * r);
    const afterCorner2 = point(midX + hSign * r, node.y);

    return [
      `M ${hub.x} ${hub.y}`,
      `L ${beforeCorner1.x} ${beforeCorner1.y}`,
      `Q ${midX} ${hub.y} ${afterCorner1.x} ${afterCorner1.y}`,
      `L ${beforeCorner2.x} ${beforeCorner2.y}`,
      `Q ${midX} ${node.y} ${afterCorner2.x} ${afterCorner2.y}`,
      `L ${node.x} ${node.y}`
    ].join(' ');
  }

  // Fans N anchor points out along the hub's left edge (in DOM/visual order),
  // so the many:1 mobile connectors leave the hub at distinct points instead
  // of bunching at its center.
  function hubEdgeFanPoint(hubRect, containerRect, index, total) {
    const x = hubRect.left - containerRect.left;
    const y = hubRect.top - containerRect.top;
    const usableHeight = hubRect.height * 0.7;
    const step = total > 1 ? usableHeight / (total - 1) : 0;
    const startY = y + hubRect.height / 2 - usableHeight / 2;
    return point(x, startY + step * index);
  }

  function buildPathData(pos, hubRect, nodeRect, containerRect) {
    const hubAnchor = hubAnchorPoint(hubRect, containerRect, pos);

    switch (pos) {
      case 'n':
        return straightPath(hubAnchor, edgePoint(nodeRect, containerRect, 'bottom'));
      case 's':
        return straightPath(hubAnchor, edgePoint(nodeRect, containerRect, 'top'));
      case 'w':
        return straightPath(hubAnchor, edgePoint(nodeRect, containerRect, 'right'));
      case 'e':
        return straightPath(hubAnchor, edgePoint(nodeRect, containerRect, 'left'));
      case 'nw':
      case 'ne':
        return elbowPath(hubAnchor, edgePoint(nodeRect, containerRect, 'bottom'));
      case 'sw':
      case 'se':
        return elbowPath(hubAnchor, edgePoint(nodeRect, containerRect, 'top'));
      default:
        return straightPath(hubAnchor, edgePoint(nodeRect, containerRect, 'center'));
    }
  }

  function createPath(d, extraAttrs) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    Object.entries(extraAttrs).forEach(([key, value]) => path.setAttribute(key, value));
    return path;
  }

  function buildMap(map) {
    const svg = map.querySelector('.source-lines');
    const hub = map.querySelector('.source-hub');
    const nodes = Array.from(map.querySelectorAll('.source-node'));
    if (!svg || !hub || nodes.length === 0) return;

    svg.innerHTML = '';
    const containerRect = map.getBoundingClientRect();
    svg.setAttribute('width', containerRect.width);
    svg.setAttribute('height', containerRect.height);
    const hubRect = hub.getBoundingClientRect();
    const isMobileLayout = window.matchMedia('(max-width: 960px)').matches;

    nodes.forEach((node, i) => {
      const pos = node.dataset.pos;
      const color = node.dataset.color || '#f25c19';
      const nodeRect = node.getBoundingClientRect();
      const d = isMobileLayout
        ? elbowPathHorizontal(
            hubEdgeFanPoint(hubRect, containerRect, i, nodes.length),
            edgePoint(nodeRect, containerRect, 'right')
          )
        : buildPathData(pos, hubRect, nodeRect, containerRect);

      const basePath = createPath(d, {
        stroke: '#45454e',
        'stroke-width': '1.5',
        'stroke-linecap': 'round'
      });
      svg.appendChild(basePath);

      const glowPath = createPath(d, {
        stroke: color,
        'stroke-width': '2.25',
        'stroke-linecap': 'round',
        opacity: '1'
      });
      svg.appendChild(glowPath);

      const totalLength = glowPath.getTotalLength();
      const dash = totalLength * DASH_FRACTION;
      const gap = totalLength - dash;
      glowPath.setAttribute('stroke-dasharray', `${dash} ${gap}`);

      const duration = BASE_DURATION_MS + (i % 5) * (DURATION_JITTER_MS / 5);
      const delay = i * 260;

      // Paths are built hub -> node (start -> end); reverse the dash sweep
      // so the visible pulse travels node -> hub (source into the logo).
      glowPath.animate(
        [{ strokeDashoffset: 0 }, { strokeDashoffset: totalLength }],
        { duration, delay, iterations: Infinity, easing: 'linear' }
      );
    });
  }

  function init() {
    const maps = document.querySelectorAll('.source-map');
    if (maps.length === 0) return;

    maps.forEach(buildMap);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => maps.forEach(buildMap), 150);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
