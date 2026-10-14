const welcomeBox = document.getElementById("welcome-box");
const welcomeMessage = document.getElementById("welcome-message");
const paymentStatus = document.getElementById("payment-status");
const paymentActionBox = document.getElementById("payment-action-box");
const startPaymentButton = document.getElementById("start-payment-button");
const paymentQrBox = document.getElementById("payment-qr-box");
const fakePaidButton = document.getElementById("fake-paid-button");
const paymentUpdateResult = document.getElementById("payment-update-result");
const logoutButton = document.getElementById("logout-button");
const magicLinkForm = document.getElementById("magic-link-form");
const magicLinkButton = document.getElementById("magic-link-button");
const magicLinkResult = document.getElementById("magic-link-result");
const verifyCodeForm = document.getElementById("verify-code-form");
const verifyCodeButton = document.getElementById("verify-code-button");
const verifyCodeResult = document.getElementById("verify-code-result");
const loginCodeInput = document.getElementById("login-code");
const randomButton = document.getElementById("random-button");
const randomResult = document.getElementById("random-result");

function showLoggedIn(email, isPaid) {
  welcomeMessage.textContent = `Xin chào ${email}`;
  paymentStatus.textContent = `Trạng thái thanh toán: ${isPaid ? "đã thanh toán" : "chưa thanh toán"}`;
  paymentStatus.className = `payment-status ${isPaid ? "is-paid" : "is-unpaid"}`;
  welcomeBox.hidden = false;
  paymentStatus.hidden = false;
  paymentActionBox.hidden = isPaid;
  paymentQrBox.hidden = true;
  paymentUpdateResult.textContent = "";
  magicLinkForm.hidden = true;
  verifyCodeForm.hidden = true;
}

function showLoggedOut() {
  welcomeBox.hidden = true;
  paymentStatus.hidden = true;
  paymentActionBox.hidden = true;
  paymentQrBox.hidden = true;
  paymentUpdateResult.textContent = "";
  magicLinkForm.hidden = false;
  verifyCodeForm.hidden = true;
  magicLinkForm.reset();
  verifyCodeForm.reset();
  magicLinkResult.textContent = "Nhập email để bắt đầu.";
  verifyCodeResult.textContent = "Mã nằm trong email vừa gửi. Chỉ dùng được trên máy này.";
}

async function loadCurrentUser() {
  try {
    const response = await fetch("/api/auth/me");

    if (!response.ok) {
      return;
    }

    const data = await response.json();

    if (data.authenticated) {
      showLoggedIn(data.email, data.is_paid);
    }
  } catch (error) {
    // Không cần báo lỗi ở UI nếu chỉ là chưa đăng nhập.
  }
}

magicLinkForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(magicLinkForm);
  const email = formData.get("email");

  magicLinkResult.textContent = "Đang gửi magic link và mã 6 số...";
  magicLinkButton.disabled = true;

  try {
    const response = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Giới hạn số lần đăng nhập, vui lòng thử lại sau. =))");
      }

      throw new Error(data.error || "Request failed");
    }

    magicLinkResult.textContent = `Đã gửi link và mã 6 số tới ${data.email}.`;
    verifyCodeForm.hidden = false;
    loginCodeInput.focus();
  } catch (error) {
    magicLinkResult.textContent = error.message || "Không gửi được email. Vui lòng thử lại.";
  } finally {
    magicLinkButton.disabled = false;
  }
});

verifyCodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(verifyCodeForm);
  const code = formData.get("code");

  verifyCodeResult.textContent = "Đang xác nhận mã...";
  verifyCodeButton.disabled = true;

  try {
    const response = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    showLoggedIn(data.email, data.is_paid);
  } catch (error) {
    verifyCodeResult.textContent = error.message || "Mã không đúng. Vui lòng thử lại.";
  } finally {
    verifyCodeButton.disabled = false;
  }
});

startPaymentButton.addEventListener("click", () => {
  paymentQrBox.hidden = false;
  paymentUpdateResult.textContent = "";
  fakePaidButton.focus();
});

fakePaidButton.addEventListener("click", async () => {
  fakePaidButton.disabled = true;
  paymentUpdateResult.textContent = "Đang cập nhật trạng thái thanh toán...";

  try {
    const response = await fetch("/api/payment/mark-paid", { method: "POST" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Không cập nhật được trạng thái thanh toán.");
    }

    showLoggedIn(data.email, data.is_paid);
  } catch (error) {
    paymentUpdateResult.textContent = error.message || "Không cập nhật được trạng thái thanh toán.";
  } finally {
    fakePaidButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    await fetch("/api/auth/logout", { method: "POST" });
    showLoggedOut();
  } catch (error) {
    welcomeMessage.textContent = "Không đăng xuất được. Vui lòng thử lại.";
  } finally {
    logoutButton.disabled = false;
  }
});

randomButton.addEventListener("click", async () => {
  randomResult.textContent = "Đang lấy số random...";
  randomButton.disabled = true;

  try {
    const response = await fetch("/api/random");

    if (!response.ok) {
      throw new Error("Request failed");
    }

    const data = await response.json();
    randomResult.textContent = `Đã lưu số random: ${data.value} (ID: ${data.id})`;
  } catch (error) {
    randomResult.textContent = "Không lấy được số random. Vui lòng thử lại.";
  } finally {
    randomButton.disabled = false;
  }
});

loadCurrentUser();
