import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ChatMessageView, ChatSessionView } from 'shared';
import { AdminChatApi } from '../../core/api/admin-chat.api';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { parseApiError } from '../../core/auth/auth-error';
import { AdminSocketService } from '../../core/socket/admin-socket.service';
import { DateVnPipe } from '../../core/format/format.pipes';
import { NotificationService } from '../../core/ui/notification.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { EmptyStateComponent, ErrorStateComponent } from '../../shared/ui/states/state-components';

type SessionFilter = 'WAITING' | 'IN_PROGRESS' | 'CLOSED';

const FILTERS: Array<{ value: SessionFilter; label: string }> = [
  { value: 'WAITING', label: 'Chờ nhận' },
  { value: 'IN_PROGRESS', label: 'Đang xử lý' },
  { value: 'CLOSED', label: 'Đã đóng' },
];

@Component({
  selector: 'app-chat-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, IconComponent, EmptyStateComponent, ErrorStateComponent, DateVnPipe],
  template: `
    <div class="cv-page chat-page">
      <app-page-header
        title="Chat CSKH"
        subtitle="Nhận phiên tư vấn, trả lời khách và tra cứu đơn liên quan."
        [showSearch]="false"
        [hasNotifications]="waitingCount() > 0"
      >
        <button type="button" class="cv-btn cv-btn--secondary" (click)="loadSessions()">
          <app-icon name="refresh-cw" size="sm" />
          Tải lại
        </button>
      </app-page-header>

      <div class="chat">
        <section class="chat__list" aria-label="Danh sách phiên chat">
          <div class="chat__filters">
            @for (filter of filters; track filter.value) {
              <button
                type="button"
                class="cv-chip chat__filter"
                [class.cv-chip--active]="activeFilter() === filter.value"
                [attr.aria-pressed]="activeFilter() === filter.value"
                (click)="selectFilter(filter.value)"
              >
                {{ filter.label }}
                @if (filter.value === 'WAITING' && waitingCount() > 0) {
                  <span class="cv-chip__count">{{ waitingCount() }}</span>
                }
              </button>
            }
          </div>

          @if (loadingSessions()) {
            <div class="cv-stack" style="padding: 12px">
              @for (row of [1, 2, 3, 4]; track row) {
                <div class="cv-skeleton" style="height: 62px"></div>
              }
            </div>
          } @else if (sessions().length === 0) {
            <p class="cv-small cv-muted" style="padding: 16px">Không có phiên nào trong nhóm này.</p>
          } @else {
            <ul class="session-list">
              @for (session of sessions(); track session.id) {
                <li>
                  <button
                    type="button"
                    class="session"
                    [class.session--active]="activeSession()?.id === session.id"
                    (click)="openSession(session)"
                  >
                    <span class="cv-avatar" aria-hidden="true">{{ initials(session.customer?.fullName) }}</span>
                    <span class="session__body">
                      <span class="session__name">{{ session.customer?.fullName || 'Khách hàng' }}</span>
                      <span class="session__preview">{{ session.lastMessagePreview }}</span>
                      @if (session.status === 'IN_PROGRESS') {
                        <span class="session__owner">Đang xử lý bởi {{ ownerLabel(session) }}</span>
                      }
                      <span class="session__meta">
                        {{ session.lastMessageAt | dateVn: 'datetime' }}
                        @if (session.agentUnread > 0) {
                          <span class="cv-badge cv-badge--danger">{{ session.agentUnread }} mới</span>
                        }
                      </span>
                    </span>
                  </button>
                </li>
              }
            </ul>
          }
        </section>

        <section class="chat__main" aria-label="Hội thoại">
          @if (activeSession(); as session) {
            <header class="chat__header">
              <div>
                <p class="chat__title">{{ session.customer?.fullName || 'Khách hàng' }}</p>
                <p class="cv-small cv-muted">
                  {{ session.customer?.phoneNumber || '—' }} · {{ session.customer?.email || 'Chưa có email' }}
                </p>
              </div>
              <div class="cv-row">
                <span class="cv-badge" [class]="'cv-badge cv-badge--' + statusTone(session)">{{ statusLabel(session) }}</span>
                @if (session.status === 'IN_PROGRESS') {
                  <span class="cv-small cv-muted">bởi {{ ownerLabel(session) }}</span>
                }
                @if (session.status === 'WAITING') {
                  <button type="button" class="cv-btn cv-btn--sm cv-btn--accent" [disabled]="busy()" (click)="claim(session)">Nhận phiên</button>
                }
                @if (canClose(session)) {
                  <button type="button" class="cv-btn cv-btn--sm cv-btn--secondary" [disabled]="busy()" (click)="close(session)">Đóng phiên</button>
                }
              </div>
            </header>

            @if (takenByOther(session)) {
              <p class="chat__notice">Phiên này đang được {{ ownerLabel(session) }} xử lý. Bạn chỉ có thể xem.</p>
            } @else if (session.status === 'CLOSED') {
              <p class="chat__notice">Phiên đã đóng. Khách nhắn lại thì phiên quay về Chờ nhận.</p>
            }

            @if (loadingMessages()) {
              <div class="cv-stack chat__messages">
                @for (row of [1, 2, 3]; track row) {
                  <div class="cv-skeleton" style="height: 44px"></div>
                }
              </div>
            } @else if (messages().length === 0) {
              <app-empty-state icon="message-square" title="Chưa có tin nhắn" message="Khách chưa gửi nội dung nào trong phiên này." />
            } @else {
              <div class="chat__messages" #scrollArea>
                @for (message of messages(); track message.id) {
                  <div class="msg" [class.msg--agent]="message.senderType === 'AGENT'" [class.msg--system]="message.senderType === 'AI'">
                    <div class="msg__bubble">
                      <p>{{ message.content }}</p>
                      <span class="msg__time">{{ message.sentAt | dateVn: 'datetime' }}</span>
                    </div>
                    <span class="msg__sender">
                      {{ senderLabel(message, session) }}
                    </span>
                  </div>
                }
              </div>
            }

            <footer class="chat__compose">
              <label class="sr-only" for="chat-input">Nội dung tin nhắn</label>
              <textarea
                class="cv-textarea chat__input"
                id="chat-input"
                [value]="draft()"
                (input)="onDraftInput($any($event.target).value)"
                (keydown.enter)="onEnter($event)"
                [placeholder]="composerPlaceholder(session)"
                [disabled]="!canReply(session)"
              ></textarea>
              <div class="chat__actions">
                <button type="button" class="cv-icon-btn" aria-label="Đính kèm ảnh" (click)="attach()">
                  <app-icon name="image" size="sm" />
                </button>
                <button
                  type="button"
                  class="cv-btn cv-btn--primary"
                  [disabled]="busy() || !canReply(session) || !draft().trim()"
                  (click)="send()"
                >
                  <app-icon name="arrow-right" size="sm" />
                  Gửi
                </button>
              </div>
            </footer>
          } @else if (chatError()) {
            <app-error-state [message]="chatError()" (retry)="selectFilter(activeFilter())" />
          } @else {
            <app-empty-state
              icon="message-square"
              title="Chọn một phiên chat"
              message="Danh sách bên trái hiển thị các phiên đang chờ, đang xử lý và đã đóng."
            />
          }
        </section>

        <aside class="chat__info" aria-label="Thông tin khách hàng">
          @if (activeSession(); as session) {
            <div class="info-block">
              <p class="cv-label">Khách hàng</p>
              <p class="chat__title" style="margin-top: 6px">{{ session.customer?.fullName || 'Khách hàng' }}</p>
              <p class="cv-small cv-muted">{{ session.customer?.phoneNumber || '—' }}</p>
              <p class="cv-small cv-muted">{{ session.customer?.email || 'Chưa có email' }}</p>
            </div>
            <div class="info-block">
              <p class="cv-label">Phiên chat</p>
              <dl class="cv-kv" style="grid-template-columns: 1fr auto; margin-top: 6px">
                <dt>Bắt đầu</dt><dd>{{ session.startedAt | dateVn: 'datetime' }}</dd>
                <dt>Chuyển người</dt><dd>{{ session.handoffAt ? (session.handoffAt | dateVn: 'datetime') : '—' }}</dd>
                <dt>Người xử lý</dt><dd>{{ session.agent ? ownerLabel(session) : '—' }}</dd>
                <dt>Kênh</dt><dd>Website</dd>
                <dt>Mã phiên</dt><dd>{{ session.id }}</dd>
              </dl>
            </div>
            <div class="info-block">
              <p class="cv-label">Gợi ý xử lý</p>
              <ul class="rule-list cv-small cv-muted">
                <li>Xác minh khách bằng số điện thoại trước khi đổi địa chỉ.</li>
                <li>Không gửi thông tin thanh toán qua chat.</li>
                <li>Vấn đề đổi trả chuyển sang phiếu đổi trả chính thức.</li>
                <li>Đóng phiên khi đã giải đáp xong.</li>
              </ul>
            </div>
            <div class="info-block">
              <p class="cv-label">Tra cứu nhanh</p>
              <p class="cv-small cv-muted">Dùng ô tìm kiếm đơn hàng để tra mã đơn khách cung cấp.</p>
            </div>
          } @else {
            <p class="cv-small cv-muted">Chọn phiên chat để xem thông tin khách.</p>
          }
        </aside>
      </div>
    </div>
  `,
  styles: [
    `
      .chat-page {
        padding-bottom: 32px;
      }

      .chat {
        display: grid;
        grid-template-columns: 300px minmax(0, 1fr) 280px;
        border: 1px solid var(--cv-border);
        border-radius: var(--cv-radius-lg);
        overflow: hidden;
        min-height: 560px;
        height: calc(100vh - 220px);
      }

      .chat__list {
        border-right: 1px solid var(--cv-border);
        display: flex;
        flex-direction: column;
        min-height: 0;
        background: var(--cv-surface);
      }

      .chat__filters {
        display: flex;
        gap: 6px;
        padding: 10px;
        border-bottom: 1px solid var(--cv-border);
        flex-wrap: wrap;
      }

      .chat__filter {
        height: 30px;
        font-size: 12px;
        padding: 0 8px;
      }

      .session-list {
        list-style: none;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        min-height: 0;
      }

      .session {
        display: flex;
        gap: 10px;
        width: 100%;
        text-align: left;
        padding: 12px 10px;
        border-bottom: 1px solid var(--cv-border);
        align-items: flex-start;
      }

      .session:hover {
        background: var(--cv-surface-alt);
      }

      .session--active {
        background: var(--cv-row-selected);
      }

      .session__body {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }

      .session__name {
        font-size: 13px;
        font-weight: 600;
      }

      .session__preview {
        font-size: 12px;
        color: var(--cv-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .session__owner {
        font-size: 11px;
        font-weight: 600;
        color: var(--cv-info-fg, #1d4f8a);
      }

      .chat__notice {
        margin: 0;
        padding: 8px 16px;
        font-size: 12px;
        color: var(--cv-muted);
        background: var(--cv-surface);
        border-bottom: 1px solid var(--cv-border);
      }

      .session__meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--cv-muted);
      }

      .chat__main {
        display: flex;
        flex-direction: column;
        min-height: 0;
        background: var(--cv-surface-alt);
      }

      .chat__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--cv-border);
        background: var(--cv-surface);
        flex-wrap: wrap;
      }

      .chat__title {
        font-size: var(--cv-text-card);
        font-weight: 600;
      }

      .chat__messages {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-height: 0;
      }

      .msg {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-width: 72%;
        align-self: flex-start;
      }

      .msg--agent {
        align-self: flex-end;
        align-items: flex-end;
      }

      .msg--system {
        align-self: center;
        max-width: 80%;
      }

      .msg__bubble {
        padding: 10px 12px;
        border-radius: var(--cv-radius);
        background: var(--cv-surface);
        border: 1px solid var(--cv-border);
        font-size: var(--cv-text-small);
      }

      .msg--agent .msg__bubble {
        background: var(--cv-navy);
        border-color: var(--cv-navy);
        color: var(--cv-on-navy);
      }

      .msg--system .msg__bubble {
        background: var(--cv-info-bg);
        border-color: var(--cv-border);
        color: var(--cv-info-fg);
      }

      .msg__time {
        display: block;
        margin-top: 4px;
        font-size: 10px;
        opacity: 0.7;
      }

      .msg__sender {
        font-size: 11px;
        color: var(--cv-muted);
      }

      .chat__compose {
        border-top: 1px solid var(--cv-border);
        background: var(--cv-surface);
        padding: 10px 12px;
        display: flex;
        gap: 10px;
        align-items: flex-end;
      }

      .chat__input {
        flex: 1 1 auto;
        min-height: 44px;
        height: 44px;
        resize: none;
      }

      .chat__actions {
        display: flex;
        gap: 6px;
        align-items: center;
        flex: 0 0 auto;
      }

      .chat__info {
        border-left: 1px solid var(--cv-border);
        padding: 16px;
        overflow-y: auto;
        background: var(--cv-surface);
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .rule-list {
        margin: 6px 0 0;
        padding-left: 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      @media (max-width: 1279px) {
        .chat {
          grid-template-columns: 260px minmax(0, 1fr);
          height: auto;
          min-height: 520px;
        }

        .chat__info {
          display: none;
        }
      }

      @media (max-width: 900px) {
        .chat {
          grid-template-columns: 1fr;
          height: auto;
        }

        .chat__list {
          border-right: 0;
          border-bottom: 1px solid var(--cv-border);
          max-height: 240px;
        }

        .chat__messages {
          min-height: 320px;
        }

        .msg {
          max-width: 88%;
        }
      }
    `,
  ],
})
export class ChatScreenComponent {
  private readonly api = inject(AdminChatApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly socket = inject(AdminSocketService);
  private readonly auth = inject(AdminAuthService);

  readonly filters = FILTERS;
  readonly activeFilter = signal<SessionFilter>('WAITING');
  readonly sessions = signal<ChatSessionView[]>([]);
  readonly allSessions = signal<ChatSessionView[]>([]);
  readonly loadingSessions = signal(true);
  readonly loadingMessages = signal(false);
  readonly chatError = signal('');

  readonly activeSession = signal<ChatSessionView | null>(null);
  readonly messages = signal<ChatMessageView[]>([]);
  readonly draft = signal('');
  readonly busy = signal(false);

  readonly waitingCount = computed(
    () => this.allSessions().filter((session) => session.status === 'WAITING').length,
  );

  constructor() {
    this.loadSessions();
    this.listenRealtime();
  }

  /** Khách nhắn hoặc phiên đổi trạng thái thì cập nhật ngay, không cần tải lại trang. */
  private listenRealtime(): void {
    this.socket.connect();
    const offMessage = this.socket.on<{ sessionId: string; message: ChatMessageView; session: ChatSessionView }>(
      'chat:message',
      ({ sessionId, message, session }) => {
        this.upsertSession(session);
        if (this.activeSession()?.id === sessionId) {
          this.activeSession.set(session);
          this.messages.update((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
        }
      },
    );
    const offSession = this.socket.on<{ session: ChatSessionView }>('chat:session-updated', ({ session }) => {
      this.upsertSession(session);
      if (this.activeSession()?.id === session.id) this.activeSession.set(session);
    });
    // Kết nối lại thì vào lại phòng của phiên đang mở.
    const offConnect = this.socket.on<void>('connect', () => {
      const id = this.joinedRoom;
      if (id) this.socket.emit('chat:join', { sessionId: id });
    });
    this.destroyRef.onDestroy(() => {
      offMessage();
      offSession();
      offConnect();
      this.stopTyping();
    });
  }

  private joinedRoom: string | null = null;
  private typingActive = false;
  private lastTypingSentAt = 0;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  /** Vào phòng của phiên để gửi "đang nhập" tới khách; rời phòng phiên trước. */
  private joinRoom(sessionId: string): void {
    if (this.joinedRoom === sessionId) return;
    if (this.joinedRoom) this.socket.emit('chat:leave', { sessionId: this.joinedRoom });
    this.joinedRoom = sessionId;
    this.socket.emit('chat:join', { sessionId });
  }

  /** Báo khách "đang nhập" khi admin đang soạn trả lời; chỉ khi phiên do chính admin này xử lý. */
  onDraftInput(value: string): void {
    this.draft.set(value);
    const session = this.activeSession();
    if (!session || session.status !== 'IN_PROGRESS' || !this.isMine(session)) return;
    if (!value.trim()) {
      this.stopTyping();
      return;
    }
    const now = Date.now();
    // Nhắc lại tối đa mỗi 2 giây để khách không thấy trạng thái tắt giữa chừng.
    if (!this.typingActive || now - this.lastTypingSentAt > 2000) {
      this.socket.emit('chat:typing', { sessionId: session.id, isTyping: true });
      this.typingActive = true;
      this.lastTypingSentAt = now;
    }
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(), 2500);
  }

  private stopTyping(): void {
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = null;
    if (!this.typingActive) return;
    this.typingActive = false;
    const sessionId = this.joinedRoom;
    if (sessionId) this.socket.emit('chat:typing', { sessionId, isTyping: false });
  }

  private upsertSession(session: ChatSessionView): void {
    this.allSessions.update((list) =>
      list.some((s) => s.id === session.id) ? list.map((s) => (s.id === session.id ? session : s)) : [session, ...list],
    );
    this.applyFilter();
  }

  loadSessions(): void {
    this.loadingSessions.set(true);
    this.chatError.set('');
    this.api
      .sessions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sessions) => {
          this.allSessions.set(sessions);
          this.applyFilter();
          this.loadingSessions.set(false);
        },
        error: () => {
          this.chatError.set('Không tải được danh sách phiên chat.');
          this.loadingSessions.set(false);
        },
      });
  }

  selectFilter(filter: SessionFilter): void {
    this.activeFilter.set(filter);
    this.activeSession.set(null);
    this.messages.set([]);
    this.applyFilter();
    if (this.sessions().length) {
      this.openSession(this.sessions()[0]);
    }
  }

  openSession(session: ChatSessionView): void {
    this.stopTyping();
    this.joinRoom(session.id);
    this.activeSession.set(session);
    this.loadingMessages.set(true);
    this.messages.set([]);
    this.api
      .messages(session.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.activeSession.set(response.session);
          this.messages.set(response.messages);
          this.loadingMessages.set(false);
        },
        error: () => {
          this.loadingMessages.set(false);
          this.notifications.show('Không tải được nội dung hội thoại.', 'error');
        },
      });
  }

  claim(session: ChatSessionView): void {
    this.busy.set(true);
    this.api
      .claim(session.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.updateSession(updated);
          this.activeSession.set(updated);
          this.notifications.show(`Đã nhận phiên của ${updated.customer?.fullName ?? 'khách'}.`);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.show(parseApiError(error).message || 'Không nhận được phiên chat.', 'error');
          // Có thể admin khác vừa nhận trước: tải lại để thấy người đang xử lý.
          this.loadSessions();
        },
      });
  }

  close(session: ChatSessionView): void {
    this.busy.set(true);
    this.api
      .close(session.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.updateSession(updated);
          this.activeSession.set(updated);
          this.notifications.show('Đã đóng phiên chat.');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.show(parseApiError(error).message || 'Không đóng được phiên chat.', 'error');
        },
      });
  }

  onEnter(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.shiftKey) return;
    keyboard.preventDefault();
    this.send();
  }

  send(): void {
    const session = this.activeSession();
    const content = this.draft().trim();
    if (!session || !content) return;
    this.stopTyping();
    if (session.status === 'WAITING') {
      this.notifications.show('Hãy nhận phiên trước khi trả lời khách.', 'error');
      return;
    }
    this.busy.set(true);
    this.api
      .send(session.id, content)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (message) => {
          this.busy.set(false);
          this.messages.update((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
          this.draft.set('');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.show(parseApiError(error).message || 'Không gửi được tin nhắn.', 'error');
          this.loadSessions();
        },
      });
  }

  attach(): void {
    this.notifications.show('Tính năng gửi ảnh sẽ dùng API tải tệp khi nối backend.');
  }

  initials(name: string | null | undefined): string {
    if (!name) return 'KH';
    const parts = name.trim().split(/\s+/);
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }

  private readonly meId = computed(() => this.auth.user()?.id ?? '');

  isMine(session: ChatSessionView): boolean {
    return !!session.agentId && session.agentId === this.meId();
  }

  /** Phiên đang do admin khác xử lý: chỉ xem được. */
  takenByOther(session: ChatSessionView): boolean {
    return session.status === 'IN_PROGRESS' && !this.isMine(session);
  }

  ownerLabel(session: ChatSessionView): string {
    return this.isMine(session) ? 'bạn' : session.agent?.fullName || 'nhân viên khác';
  }

  /** Phiên Chờ nhận ai cũng đóng được; phiên Đang xử lý chỉ người đang xử lý (Super Admin được gỡ phiên bị bỏ quên). */
  canClose(session: ChatSessionView): boolean {
    if (session.status === 'WAITING') return true;
    if (session.status !== 'IN_PROGRESS') return false;
    return this.isMine(session) || this.auth.role() === 'SUPER_ADMIN';
  }

  canReply(session: ChatSessionView): boolean {
    return session.status === 'WAITING' || (session.status === 'IN_PROGRESS' && this.isMine(session));
  }

  composerPlaceholder(session: ChatSessionView): string {
    if (session.status === 'CLOSED') return 'Phiên đã đóng.';
    if (this.takenByOther(session)) return `Phiên đang được ${this.ownerLabel(session)} xử lý, bạn chỉ có thể xem.`;
    return 'Nhập tin nhắn trả khách… (Enter để gửi, Shift+Enter xuống dòng)';
  }

  senderLabel(message: ChatMessageView, session: ChatSessionView): string {
    if (message.senderType === 'AI') return 'Trợ lý AI';
    if (message.senderType === 'AGENT') {
      if (message.senderId && message.senderId === this.meId()) return 'Bạn';
      // Mỗi tin ghi đúng admin đã trả lời, kể cả khi phiên từng do người khác xử lý.
      return message.senderName || session.agent?.fullName || 'Nhân viên';
    }
    return 'Khách';
  }

  statusLabel(session: ChatSessionView): string {
    if (session.status === 'WAITING') return 'Chờ nhận';
    if (session.status === 'IN_PROGRESS') return 'Đang xử lý';
    return 'Đã đóng';
  }

  statusTone(session: ChatSessionView): string {
    if (session.status === 'WAITING') return 'warning';
    if (session.status === 'IN_PROGRESS') return 'info';
    return 'neutral';
  }

  private applyFilter(): void {
    const filter = this.activeFilter();
    this.sessions.set(this.allSessions().filter((session) => session.status === filter));
  }

  private updateSession(updated: ChatSessionView): void {
    this.allSessions.update((list) => list.map((session) => (session.id === updated.id ? updated : session)));
    this.applyFilter();
  }
}
