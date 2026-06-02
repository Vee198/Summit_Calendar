// Summit Calendar Tracking - Viewer PIN Configuration
// แก้ไขไฟล์นี้เพื่อเพิ่ม/ลบ/แก้ไข PIN ของผู้ดู
// หลังแก้ไขต้อง deploy ใหม่: npm run deploy

const VIEWER_PINS = [
  { pin: '1111', id: 'nopamas', name: 'คุณ Nopamas', active: true, telegram_chat_id: '8766352693' },
  { pin: '2222', id: 'jatuporn', name: 'คุณ Jatuporn', active: true, telegram_chat_id: '8708044010' },
  { pin: '3333', id: 'warunee', name: 'คุณ Warunee', active: true, telegram_chat_id: '8725116507' },
  { pin: '1122', id: 'jv_team', name: 'JV Team', active: true, telegram_chat_id: '' },
  { pin: '2211', id: 'bd_team', name: 'BD Team', active: true, telegram_chat_id: '' },
  // เพิ่ม user ใหม่ตามตัวอย่างด้านล่าง:
  // { pin: '0000', id: 'somchai', name: 'คุณ Somchai', active: false, telegram_chat_id: '' },
];

export default VIEWER_PINS;
