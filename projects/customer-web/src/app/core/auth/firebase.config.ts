/**
 * Cấu hình Firebase Web (public, không phải bí mật).
 * Lấy tại Firebase Console → Project settings → Your apps → Web app → SDK setup and configuration.
 *
 * Lưu ý: đây là config công khai, an toàn khi commit. Bí mật nằm ở service account
 * dùng cho backend (xem FIREBASE_* trong .env), tuyệt đối không đặt ở đây.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyCVw6bx60Nx__aEudKToIFxFa4rHeHWiFw',
  authDomain: 'caraveso-6fc4a.firebaseapp.com',
  projectId: 'caraveso-6fc4a',
  storageBucket: 'caraveso-6fc4a.firebasestorage.app',
  messagingSenderId: '828167544538',
  appId: '1:828167544538:web:c64c23b2d201933fee0fe3',
};
