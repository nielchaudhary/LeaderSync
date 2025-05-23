<b>Real time Leaderboard Service:</b> <br/>
→ P99 latency for Top-K and Rank queries must be <b>< 50 ms</b>.  <br/>
→ Must sustain <b>10,000 score writes/second and 5,000 leaderboard reads/second per game on a single 4-core node (1M users/game)</b>.  <br/>
→ No loss of score data if a node dies.  <br/>
→ Recovery after node failure with full data integrity within <b>≤ 60 seconds</b>.  <br/>
→ Service process heap memory usage <b>≤ 512 MB per node</b>.
