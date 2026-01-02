const swiper = new Swiper('.category-slider', {
  slidesPerView: 5,
  spaceBetween: 20,
  watchOverflow: true,
  centerInsufficientSlides: true,
  navigation: {
    nextEl: '.swiper-button-next',
    prevEl: '.swiper-button-prev',
  },
  breakpoints: {
    320: {
      slidesPerView: 2,
      spaceBetween: 45,
    },
    375: {
      slidesPerView: 3,
      spaceBetween: 60,
    },
    768: {
      slidesPerView: 6,
      spaceBetween: 10,
    },
    1024: {
      slidesPerView: 5,
      spaceBetween: 20,
    }
  }
});

document.querySelector('.swiper-button-next').addEventListener('click', () => {
  swiper.slideTo(swiper.slides.length - 1, 500);
});

document.querySelector('.swiper-button-prev').addEventListener('click', () => {
  swiper.slideTo(0, 500);
});
