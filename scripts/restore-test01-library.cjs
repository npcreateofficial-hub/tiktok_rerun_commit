const fs = require('fs');
const crypto = require('crypto');

const entries = [
  {
    path: '/home/nynum/rerun_tiktok/data/uploads/ab18d512-c3b4-4611-a0b9-c2f02b13ea6a/0922.mp4',
    name: '0922',
    addedAt: new Date('2026-10-08T17:03:12+07:00').getTime(),
  },
  {
    path: '/home/nynum/rerun_tiktok/data/uploads/48617522-6c5f-43db-ac93-5a4e775e3322/รีรันจงเจริญ7.mp4',
    name: 'รีรันจงเจริญ7',
    addedAt: new Date('2026-10-09T09:31:03+07:00').getTime(),
  },
]
  .filter((item) => fs.existsSync(item.path))
  .map((item) => ({
    id: crypto.randomUUID(),
    path: item.path,
    name: item.name,
    size: fs.statSync(item.path).size,
    addedAt: item.addedAt,
  }));

const target = '/home/nynum/rerun_tiktok/data/profile/video-library-test01.json';
const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '[]';
fs.writeFileSync(`${target}.restore-${Date.now()}.bak`, before);
fs.writeFileSync(target, JSON.stringify(entries, null, 2));

console.log(JSON.stringify({ restored: entries.length, names: entries.map((item) => item.name) }, null, 2));
