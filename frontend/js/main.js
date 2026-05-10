// Navbar scroll effect
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 60) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
});

// Mobile menu
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('navMenu');
hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
});
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    });
});

// Smooth scroll for all anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior:'smooth' });
    });
});

// Gallery lightbox
function openGallery(src) {
    document.getElementById('lightbox').classList.add('active');
    document.getElementById('lightboxImg').src = src;
}
function closeLightbox() {
    document.getElementById('lightbox').classList.remove('active');
}

// Booking price calculation
const roomSelect = document.getElementById('roomSelect');
const checkIn = document.getElementById('checkIn');
const checkOut = document.getElementById('checkOut');
const totalSpan = document.getElementById('totalPrice');

function updateTotal() {
    const selectedOption = roomSelect.selectedOptions[0];
    if (!selectedOption || !checkIn.value || !checkOut.value) {
        totalSpan.textContent = '₹0';
        return;
    }
    const price = parseInt(selectedOption.dataset.price);
    const nights = Math.max(1, (new Date(checkOut.value) - new Date(checkIn.value)) / (1000*60*60*24));
    if (nights > 0) totalSpan.textContent = '₹' + (price * nights).toLocaleString();
}
roomSelect.addEventListener('change', updateTotal);
checkIn.addEventListener('change', updateTotal);
checkOut.addEventListener('change', updateTotal);

// Booking form submission
document.getElementById('bookingForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('guestName').value;
    const room = roomSelect.options[roomSelect.selectedIndex].text.split(' –')[0];
    document.getElementById('bookingForm').style.display = 'none';
    const conf = document.getElementById('confirmation');
    conf.style.display = 'block';
    conf.innerHTML = `
        <h3>✅ Reservation Confirmed!</h3>
        <p>Thank you, ${name}. Your ${room} is booked. We will contact you shortly.</p>
        <button class="btn btn-gold" onclick="location.reload()" style="margin-top:20px;">Make Another Booking</button>
    `;
});

// Contact form (demo)
document.getElementById('contactForm').addEventListener('submit', function(e) {
    e.preventDefault();
    alert('Thank you for your message! We will get back to you soon.');
    this.reset();
});