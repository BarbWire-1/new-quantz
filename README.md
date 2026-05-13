# 🌌 Quantz

An ultra-lightweight reactive template engine for native Web Components with global event delegation. Built close to the DOM with optional plugins for a rich, intuitive DX experience.

> ⚠️ **Work in Progress:** Quantz is under active development and evolving rapidly. APIs might change as we refine the core. Feel free to explore, test, and share your feedback!

Quantz is designed to be as close to the native web platform as possible. The core handles reactivity and high-performance event delegation with a near-zero footprint, while fancy DX features (like auto-scrolling or custom hooks) can be plugged in optionally to keep your production bundle incredibly small.

---

## ⚡ Hyper-Optimized & Production-Ready

Quantz is built from the ground up using a **pure functional architecture**. This design choice ensures that the codebase is incredibly predictable, highly testable, and resilient against extreme optimization.

* **Aggressive Compression Survivor:** The entire library has been stress-tested with brutal minification settings (including `passes: 500`, `mangle.toplevel`, and `booleans_as_integers`). It runs 100% stable in production, leaving you with a core bundle size of virtually zero overhead.
* **Pure & Side-Effect Free:** Functions behave exactly as expected, making tree-shaking dead-simple for modern bundlers—though it runs completely standalone in any JS environment without any build tools as well.

---

## 📦 Installation

Install the package via npm, pnpm, or yarn:

```bash
pnpm add quantz
# or
npm install quantz
```

---

## 🚀 Quick Start

Quantz maps directly to modern, native JavaScript environments. You can import the core essentials or pick optional plugins selectively to keep your bundle size minimal.

### Core Usage

```javascript
import { QElement, createComponent, html } from 'quantz';

// Core utilities running under the hood with high-performance event delegation
```

### Optional Fancy DX Plugins

```javascript
import { autoScrollToBottom } from 'quantz/plugins/scroll';
```

---

## 📜 License

MIT License. Copyright (c) 2026 barbwire.
