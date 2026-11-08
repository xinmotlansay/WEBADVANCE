/**
 * Cấu hình Firebase Web (public, không phải bí mật).
 * Lấy tại Firebase Console → Project settings → Your apps → Web app → SDK setup and configuration.
 *
 * Lưu ý: đây là config công khai, an toàn khi commit. Bí mật nằm ở service account
 * dùng cho backend (xem FIREBASE_* trong .env), tuyệt đối không đặt ở đây.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyBqSEUkOGKiG-wvkyx02NqwD0NzDh9-N58',
  authDomain: 'web2-5e4f3.firebaseapp.com',
  projectId: 'web2-5e4f3',
  storageBucket: 'web2-5e4f3.firebasestorage.app',
  messagingSenderId: '838934773474',
  appId: '1:838934773474:web:396dac5a8fa19ded6ce8bb',
  measurementId: 'G-YJM4XJ17TQ',
};
