
  document.addEventListener("mousemove", (e) => {
    const moveArea = document.querySelector('.parallax-bg');
    if (!moveArea) return;

    // Get mouse position as a percentage of the screen
    const x = (window.innerWidth - e.pageX * 2) / 100;
    const y = (window.innerHeight - e.pageY * 2) / 100;

    // Apply the movement
    moveArea.style.transform = `translateX(${x}px) translateY(${y}px)`;
  });
