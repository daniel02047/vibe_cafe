/**
 * ========================================================
 * 바이브 카페 주문서 및 주문 내역 스크립트 (script.js)
 * ========================================================
 * 주요 기능:
 * 1. Supabase cafe_orders 테이블에 주문 데이터 실시간 저장
 * 2. 음료, 사이즈, 옵션, 수량 변경 시 실시간 예상 금액 계산
 * 3. 주문하기 버튼 클릭 시 유효성 검사 및 중복 방지(버튼 비활성화)
 * 4. 탭 전환 기능 (☕ 주문하기 / 📋 주문 내역)
 * 5. 주문 취소 및 전체 내역 관리
 */

// ========================================================
// [Supabase 설정 및 클라이언트 초기화]
// ========================================================
// 본인의 Supabase 프로젝트 대시보드(Project Settings -> API)에서 복사한 값을 넣어주세요.
const SUPABASE_URL = 'https://qupihifciaoudsrykqma.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cGloaWZjaWFvdWRzcnlrcW1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMzcxMjQsImV4cCI6MjEwNjgxMzEyNH0.8InOATv6bd5ekXzrCjiAEEokdYD_dV0-zMougTFkAEE';

// Supabase 클라이언트 객체 생성 (요청 변수명: supabaseClient)
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// --------------------------------------------------------
// 1. HTML 요소 선택 (DOM 탐색)
// --------------------------------------------------------

// 탭 관련 요소
const tabOrderBtn = document.getElementById('tabOrderBtn');                 // '주문하기' 탭 버튼
const tabHistoryBtn = document.getElementById('tabHistoryBtn');             // '주문 내역' 탭 버튼
const orderSection = document.getElementById('orderSection');               // 주문서 섹션
const historySection = document.getElementById('historySection');           // 주문 내역 섹션
const orderCountBadge = document.getElementById('orderCountBadge');         // 탭 옆 주문 건수 배지

// 주문서 폼 관련 요소
const orderForm = document.getElementById('orderForm');                     // 주문서 전체 폼
const customerNameInput = document.getElementById('customerName');         // 이름 입력칸
const customerPhoneInput = document.getElementById('customerPhone');       // 전화번호 입력칸
const beverageSelect = document.getElementById('beverageSelect');           // 음료 선택 드롭다운
const quantityInput = document.getElementById('quantityInput');             // 수량 입력칸
const specialRequestsInput = document.getElementById('specialRequests');   // 요청사항 텍스트 영역
const totalPriceElement = document.getElementById('totalPrice');           // 예상 금액 숫자 표시 span
const confirmationArea = document.getElementById('orderConfirmationArea'); // 중앙 주문 확인 모달 영역
const submitOrderBtn = document.getElementById('submitOrderBtn');           // 주문하기 버튼

// 주문 내역 관련 요소
const orderList = document.getElementById('orderList');                     // 주문 카드 목록 컨테이너
const totalOrderSummary = document.getElementById('totalOrderSummary');     // 총 주문 금액 및 건수 요약 텍스트
const clearAllOrdersBtn = document.getElementById('clearAllOrdersBtn');     // 내역 모두 지우기 버튼

// --------------------------------------------------------
// 2. 상태 관리 변수 (State)
// --------------------------------------------------------
let orders = [];          // 접수된 주문 객체들을 저장할 배열
let orderIdCounter = 1;   // 1부터 1씩 증가하는 주문 고유 번호 (로컬 대비용)

// --------------------------------------------------------
// 3. 실시간 예상 금액 계산 함수
// --------------------------------------------------------
/**
 * 예상 금액을 계산하고 화면에 업데이트하는 함수
 * @returns {number} 최종 계산된 총 금액
 */
function calculateTotal() {
  // (1) 선택한 음료 가격 가져오기
  const selectedOption = beverageSelect.options[beverageSelect.selectedIndex];
  const beveragePrice = Number(selectedOption.dataset.price) || 0;

  // 음료를 선택하지 않았으면 무조건 0원으로 표시
  if (!beverageSelect.value || beveragePrice === 0) {
    totalPriceElement.textContent = '0';
    return 0;
  }

  // (2) 선택된 사이즈 추가 금액
  const checkedSize = document.querySelector('input[name="size"]:checked');
  const sizePrice = checkedSize ? (Number(checkedSize.dataset.price) || 0) : 0;

  // (3) 선택된 추가 옵션들의 합산 금액
  const checkedOptions = document.querySelectorAll('input[name="option"]:checked');
  let optionTotalPrice = 0;
  checkedOptions.forEach(option => {
    optionTotalPrice += Number(option.dataset.price) || 0;
  });

  // (4) 수량 확인 (1 이상 유지)
  let quantity = parseInt(quantityInput.value, 10);
  if (isNaN(quantity) || quantity < 1) {
    quantity = 1;
  }

  // (5) 총 금액 계산: (음료 기본가 + 사이즈 추가금 + 옵션 추가금) * 수량
  const total = (beveragePrice + sizePrice + optionTotalPrice) * quantity;

  // (6) 천 단위 콤마(toLocaleString)를 붙여 화면에 표시
  totalPriceElement.textContent = total.toLocaleString();

  return total;
}

// 폼 입력값 변경 시 실시간 금액 계산 이벤트 연결
orderForm.addEventListener('change', calculateTotal);
quantityInput.addEventListener('input', calculateTotal);

// --------------------------------------------------------
// 4. 주문하기(Submit) 처리: Supabase 저장 연동
// --------------------------------------------------------
orderForm.addEventListener('submit', async function (event) {
  // 페이지 새로고침 방지
  event.preventDefault();

  // (1) 이름 필수 입력 검증
  const customerName = customerNameInput.value.trim();
  if (customerName === '') {
    alert('이름을 입력해주세요');
    customerNameInput.focus();
    return;
  }

  // (2) 음료 필수 선택 검증
  if (!beverageSelect.value) {
    alert('음료를 선택해주세요');
    beverageSelect.focus();
    return;
  }

  // (3) 최종 금액 계산
  const total = calculateTotal();

  // (4) 주문 상세 데이터 추출
  const selectedOption = beverageSelect.options[beverageSelect.selectedIndex];
  const beverageName = selectedOption.text.split(' ')[0]; // 예: "카페라떼"

  const checkedSize = document.querySelector('input[name="size"]:checked');
  const sizeValue = checkedSize ? checkedSize.value : 'M';

  // 체크된 옵션 이름 목록 만들기
  const checkedOptions = document.querySelectorAll('input[name="option"]:checked');
  const optionNames = [];
  checkedOptions.forEach(option => {
    const label = document.querySelector(`label[for="${option.id}"]`);
    if (label) {
      // "+500원" 같은 가격 표기를 제외한 순수 이름 추출 (예: "샷 추가")
      const pureName = label.textContent.replace(/\s*\+.*$/, '').trim();
      optionNames.push(pureName);
    }
  });

  const optionsPart = optionNames.length > 0 ? ` (${optionNames.join(', ')})` : '';

  let quantity = parseInt(quantityInput.value, 10);
  if (isNaN(quantity) || quantity < 1) {
    quantity = 1;
  }

  const specialRequests = specialRequestsInput.value.trim();

  // 현재 시간 포맷팅 (예: "오후 12:45")
  const now = new Date();
  const orderTime = now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  // (5) 버튼 비활성화 (중복 클릭 방지)
  submitOrderBtn.disabled = true;
  submitOrderBtn.textContent = '주문 처리 중...';

  try {
    // (6) Supabase cafe_orders 테이블에 저장할 데이터 구성
    // ※ 주의: DB 컬럼명이 beverage인지 baverage인지 확인해주세요. (기본은 beverage로 매핑)
    const orderData = {
      customer_name: customerName,
      customer_phone: customerPhoneInput.value.trim(),
      beverage: beverageName, // Supabase 테이블 생성 시 baverage로 만드셨다면 'baverage': beverageName 으로 수정해주세요
      options: optionNames,
      size: sizeValue,
      quantity: quantity,
      requests: specialRequests,
      total_price: total
    };

    // Supabase 클라이언트 확인
    if (!supabaseClient) {
      throw new Error('Supabase 클라이언트가 초기화되지 않았습니다. CDN 연결을 확인해주세요.');
    }

    // Supabase cafe_orders 테이블에 INSERT 요청
    const { data, error } = await supabaseClient
      .from('cafe_orders')
      .insert([orderData])
      .select();

    // 저장 실패 시 에러 발생
    if (error) {
      throw error;
    }

    // (7) 저장 성공 시 처리: DB에서 생성된 id 가져오기
    const savedOrder = (data && data.length > 0) ? data[0] : null;
    const finalOrderId = savedOrder ? savedOrder.id : orderIdCounter++;

    // 새 주문 객체 생성 및 목록 배열에 추가 (최신 주문이 맨 위로)
    const newOrder = {
      id: finalOrderId,
      customerName: customerName,
      beverageName: beverageName,
      size: sizeValue,
      options: optionNames,
      quantity: quantity,
      requests: specialRequests,
      price: total,
      orderTime: orderTime
    };

    orders.unshift(newOrder);

    // 주문 내역 목록 화면 및 배지 건수 갱신
    renderOrders();

    // (8) 기존 주문 확인 모달 팝업 표시
    const confirmationMessage = `#${finalOrderId} ${customerName}님, ${beverageName} ${sizeValue}사이즈${optionsPart} ${quantity}잔, 총 ${total.toLocaleString()}원 주문이 접수되었습니다!`;

    confirmationArea.innerHTML = `
      <div class="confirmation-box">
        <div class="confirmation-icon">☕🧾</div>
        <h2 class="confirmation-title">주문이 접수되었습니다! (#${finalOrderId})</h2>
        <p class="confirmation-text" id="confirmationTextMsg"></p>
        <button type="button" id="closeConfirmationBtn" class="confirmation-close-btn">확인</button>
      </div>
    `;

    // 고객 이름이 포함된 메시지는 안전하게 textContent로 주입 (XSS 보안)
    const confirmationTextMsg = document.getElementById('confirmationTextMsg');
    if (confirmationTextMsg) {
      confirmationTextMsg.textContent = confirmationMessage;
    }

    // 모달 표시
    confirmationArea.hidden = false;
    confirmationArea.classList.remove('hidden');

    // 모달 닫기 버튼 이벤트 연결
    const closeBtn = document.getElementById('closeConfirmationBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeConfirmationModal);
    }

  } catch (err) {
    // 저장 실패 시: 콘솔에 에러 출력 및 경고창 띄우기
    console.error('주문 저장 실패 에러 상세:', err);
    alert('주문 저장에 실패했어요');
  } finally {
    // (9) 성공/실패 여부와 상관없이 주문하기 버튼 다시 활성화
    submitOrderBtn.disabled = false;
    submitOrderBtn.textContent = '주문하기';
  }
});

/**
 * 주문 확인 모달 팝업을 닫는 함수
 */
function closeConfirmationModal() {
  confirmationArea.hidden = true;
  confirmationArea.classList.add('hidden');
  confirmationArea.innerHTML = '';
}

// 모달 바깥 어두운 배경 클릭 시 닫기
confirmationArea.addEventListener('click', function (event) {
  if (event.target === confirmationArea) {
    closeConfirmationModal();
  }
});

// --------------------------------------------------------
// 5. 주문 내역 목록 렌더링 함수 (renderOrders)
// --------------------------------------------------------
/**
 * orders 배열을 바탕으로 주문 내역 목록을 화면에 출력하는 함수
 * - 보안 원칙: 고객이 입력한 값(이름, 요청사항)은 innerHTML 대신 textContent로 안전하게 삽입합니다.
 */
function renderOrders() {
  // (1) 탭 옆의 둥근 갈색 배지에 주문 건수 업데이트
  orderCountBadge.textContent = orders.length;

  // (2) 기존 목록 비우기
  orderList.innerHTML = '';

  // (3) 주문 내역이 없을 때 안내 메시지 출력
  if (orders.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-history';
    emptyMessage.textContent = '아직 주문 내역이 없어요 ☕';
    orderList.appendChild(emptyMessage);

    // 하단 요약 문구 업데이트 및 전체 삭제 버튼 숨김
    totalOrderSummary.textContent = '총 주문 금액: 0원 (0건)';
    clearAllOrdersBtn.style.display = 'none';
    return;
  }

  // (4) 주문 내역이 있을 때는 전체 삭제 버튼 노출
  clearAllOrdersBtn.style.display = 'block';

  // (5) 각 주문 건별 카드 생성
  orders.forEach(order => {
    // 주문 카드 컨테이너 (베이지 카드 + 좌측 갈색 세로줄)
    const card = document.createElement('div');
    card.className = 'order-card';

    // 우측 상단 "취소" 버튼
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'order-cancel-btn';
    cancelBtn.textContent = '취소';
    cancelBtn.addEventListener('click', () => {
      // confirm으로 삭제 여부 확인
      const isConfirmed = confirm(`#${order.id}번 주문(${order.customerName}님)을 취소하시겠습니까?`);
      if (isConfirmed) {
        // 해당 주문을 orders 배열에서 제거
        orders = orders.filter(item => item.id !== order.id);
        renderOrders(); // 화면 갱신
      }
    });

    // 1줄: "#1 홍길동님 · 5,000원"
    const line1 = document.createElement('div');
    line1.className = 'order-card-header';
    line1.textContent = `#${order.id} ${order.customerName}님 · ${order.price.toLocaleString()}원`;

    // 2줄: "카페라떼 M사이즈 (샷 추가) 1잔"
    const line2 = document.createElement('div');
    line2.className = 'order-card-body';
    const optionsText = order.options.length > 0 ? ` (${order.options.join(', ')})` : '';
    line2.textContent = `${order.beverageName} ${order.size}사이즈${optionsText} ${order.quantity}잔`;

    // 3줄: 요청사항(있을 때만) · 주문 시간
    const line3 = document.createElement('div');
    line3.className = 'order-card-footer';
    if (order.requests && order.requests !== '') {
      line3.textContent = `${order.requests} · ${order.orderTime}`;
    } else {
      line3.textContent = order.orderTime;
    }

    // 카드에 요소 조립 (손님 입력값은 모두 textContent로 안전하게 적용)
    card.appendChild(cancelBtn);
    card.appendChild(line1);
    card.appendChild(line2);
    card.appendChild(line3);

    // 목록에 카드 추가
    orderList.appendChild(card);
  });

  // (6) 총 주문 금액 합산 및 요약 문구 업데이트
  const totalAmount = orders.reduce((sum, order) => sum + order.price, 0);
  totalOrderSummary.textContent = `총 주문 금액: ${totalAmount.toLocaleString()}원 (${orders.length}건)`;
}

// --------------------------------------------------------
// 6. 탭 전환(Tab Navigation) 이벤트 처리
// --------------------------------------------------------

// "☕ 주문하기" 탭 클릭
tabOrderBtn.addEventListener('click', function () {
  tabOrderBtn.classList.add('active');
  tabHistoryBtn.classList.remove('active');

  orderSection.classList.remove('hidden');
  historySection.classList.add('hidden');
});

// "📋 주문 내역" 탭 클릭
tabHistoryBtn.addEventListener('click', function () {
  tabHistoryBtn.classList.add('active');
  tabOrderBtn.classList.remove('active');

  historySection.classList.remove('hidden');
  orderSection.classList.add('hidden');

  // 탭 이동 시 최신 주문 내역 렌더링
  renderOrders();
});

// --------------------------------------------------------
// 7. 내역 모두 지우기 버튼 처리
// --------------------------------------------------------
clearAllOrdersBtn.addEventListener('click', function () {
  if (orders.length === 0) return;

  const isConfirmed = confirm('모든 주문 내역을 지우시겠습니까?');
  if (isConfirmed) {
    orders = [];
    renderOrders();
  }
});

// --------------------------------------------------------
// 8. 다시 작성(Reset) 버튼 처리 (주문 내역은 유지, 입력 폼만 초기화)
// --------------------------------------------------------
orderForm.addEventListener('reset', function () {
  // 브라우저 기본 리셋 완료 후 비동기로 실행
  setTimeout(() => {
    // M 사이즈 및 수량 1 복원
    const defaultSizeM = document.getElementById('sizeM');
    if (defaultSizeM) {
      defaultSizeM.checked = true;
    }
    quantityInput.value = 1;

    // 예상 금액 0원으로 재계산
    calculateTotal();

    // 열려있는 모달 닫기
    closeConfirmationModal();
  }, 0);
});

// --------------------------------------------------------
// 9. 초기 실행 (금액 0원 계산 및 주문 내역 초기 렌더링)
// --------------------------------------------------------
calculateTotal();
renderOrders();
