## Picture index: mtg

69107 artworks, 5.1 MB. Chosen colour weight 3, max distance 54.1.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 800 | 73.8% | 89.4% | 94.6% | 96.1% | 96.8% | 97.1% | 45.9 / 60.8 | 11.2 |
| 48 | 800 | 84.3% | 93.8% | 97.0% | 97.9% | 98.3% | 98.0% | 41.0 / 56.2 | 16.1 |
| 72 | 800 | 89.5% | 96.1% | 97.8% | 98.3% | 98.4% | 98.5% | 38.0 / 52.8 | 18.1 |
| 120 | 800 | 96.3% | 97.9% | 98.8% | 99.0% | 98.9% | 98.8% | 33.1 / 49.5 | 21.8 |

Non-card crops, best distance (chosen w): p05 61.3, p50 74.0, p90 91.2

### Learned embedding

Top-1 by card height: 32px 91.8%, 48px 98.8%, 72px 98.8%, 120px 99.1%.
Correct matches' similarity p05 0.75, p50 0.866; lead p10 0.135. Non-cards' best similarity p50 0.546, p99 0.81.
Accepted (similarity ≥ 0.81, lead ≥ 0.02) and correct: 32px 9.8%, 48px 66.9%, 72px 95.4%, 120px 98.8%

Share of cards identified correctly *and* under the cut-off: 32px 79.6%, 48px 91.8%, 72px 94.9%, 120px 96.8%
