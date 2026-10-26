## Picture index: fab

16657 artworks, 1.2 MB. Chosen colour weight 1, max distance 33.5.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 798 | 60.0% | 65.3% | 68.2% | 67.9% | 67.9% | 67.4% | 28.5 / 36.9 | 0.0 |
| 48 | 798 | 63.8% | 67.3% | 68.4% | 68.7% | 68.4% | 68.5% | 26.5 / 34.2 | 0.0 |
| 72 | 798 | 62.0% | 66.2% | 67.0% | 66.9% | 67.2% | 66.9% | 25.8 / 33.1 | 0.0 |
| 120 | 798 | 66.8% | 67.5% | 67.7% | 67.5% | 67.5% | 67.3% | 22.1 / 29.0 | 0.0 |

Non-card crops, best distance (chosen w): p05 38.5, p50 44.6, p90 49.5

### Learned embedding

Top-1 by card height: 32px 59.8%, 48px 63.8%, 72px 65.7%, 120px 66.7%.
Correct matches' similarity p05 0.72, p50 0.843; lead p10 0.002. Non-cards' best similarity p50 0.446, p99 0.626.
Accepted (similarity ≥ 0.626, lead ≥ 0.02) and correct: 32px 46.7%, 48px 63.2%, 72px 65.7%, 120px 66.7%

Share of cards identified correctly *and* under the cut-off: 32px 58.9%, 48px 64.3%, 72px 64.4%, 120px 67.2%
