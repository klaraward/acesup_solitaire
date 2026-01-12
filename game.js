// Kortlek
const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rankValues = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

let deck = [];
let slots = [[], [], [], []]; // Varje slot är nu en hög med kort
let selectedSlot = null;
let gameOver = false;
let hintsEnabled = true;

// Kvot-hantering
const DAILY_QUOTA = 10;
const UNLIMITED_PARAM = 'unlimited';

function isUnlimitedMode() {
    const params = new URLSearchParams(window.location.search);
    return params.has(UNLIMITED_PARAM);
}

function getTodayKey() {
    return 'gamesPlayed_' + new Date().toISOString().split('T')[0];
}

function getGamesPlayedToday() {
    if (isUnlimitedMode()) return 0;
    return parseInt(localStorage.getItem(getTodayKey()) || '0', 10);
}

function incrementGamesPlayed() {
    if (isUnlimitedMode()) return;
    const count = getGamesPlayedToday() + 1;
    localStorage.setItem(getTodayKey(), count.toString());
    updateQuotaDisplay();
}

function hasQuotaLeft() {
    if (isUnlimitedMode()) return true;
    return getGamesPlayedToday() < DAILY_QUOTA;
}

function updateQuotaDisplay() {
    const quotaEl = document.getElementById('quota-display');
    if (!quotaEl) return;

    if (isUnlimitedMode()) {
        quotaEl.textContent = 'Obegränsat läge';
    } else {
        const played = getGamesPlayedToday();
        const left = Math.max(0, DAILY_QUOTA - played);
        quotaEl.textContent = `${left} spel kvar idag`;
    }
}

function showQuotaExceeded() {
    const statusEl = document.getElementById('status');
    statusEl.innerHTML = '<strong>Du har spelat klart för idag! Kom tillbaka imorgon.</strong>';
    statusEl.classList.add('game-over');
    document.getElementById('deck').style.cursor = 'default';
    document.getElementById('restart-btn').disabled = true;
}

// Skapa en blandad kortlek
function createDeck() {
    deck = [];
    for (let suit of suits) {
        for (let rank of ranks) {
            deck.push({ suit, rank, value: rankValues[rank] });
        }
    }
    shuffleDeck();
}

// Blanda kortleken (Fisher-Yates)
function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

// Kontrollera om färgen är röd
function isRed(suit) {
    return suit === '♥' || suit === '♦';
}

// Skapa HTML för ett kort
function createCardElement(card, slotIndex) {
    const div = document.createElement('div');
    div.className = `card front ${isRed(card.suit) ? 'red' : 'black'}`;
    div.innerHTML = `
        <div class="corner top">
            <span class="rank">${card.rank}</span>
            <span class="suit">${card.suit}</span>
        </div>
        <span class="center-suit">${card.suit}</span>
        <div class="corner bottom">
            <span class="rank">${card.rank}</span>
            <span class="suit">${card.suit}</span>
        </div>
    `;
    div.dataset.slotIndex = slotIndex;
    return div;
}

// Rendera kortleken
function renderDeck() {
    const deckEl = document.getElementById('deck');
    deckEl.innerHTML = '';

    if (deck.length > 0) {
        const stackSize = Math.min(5, deck.length);
        for (let i = 0; i < stackSize; i++) {
            const cardBack = document.createElement('div');
            cardBack.className = 'card back';
            deckEl.appendChild(cardBack);
        }
        deckEl.style.cursor = 'pointer';
    } else {
        deckEl.style.cursor = 'default';
    }

    // Uppdatera kortantal
    document.getElementById('cards-left').textContent = deck.length;
}

// Rendera kortplatserna
function renderSlots() {
    for (let i = 0; i < 4; i++) {
        const slotEl = document.getElementById(`slot-${i}`);
        slotEl.innerHTML = '';

        if (slots[i].length > 0) {
            slotEl.classList.remove('empty');

            // Skapa en container för alla kort i högen
            const pileEl = document.createElement('div');
            pileEl.className = 'card-pile';

            // Rendera alla kort i högen
            for (let j = 0; j < slots[i].length; j++) {
                const card = slots[i][j];
                const cardEl = createCardElement(card, i);
                const isTopCard = (j === slots[i].length - 1);

                if (!isTopCard) {
                    cardEl.classList.add('stacked');
                } else {
                    // Markera valda kort (endast översta)
                    if (selectedSlot === i) {
                        cardEl.classList.add('selected');
                    }

                    // Markera kort som kan tas bort (endast översta, om hints är på)
                    if (hintsEnabled && canBeRemoved(i)) {
                        cardEl.classList.add('removable');
                    }
                }

                pileEl.appendChild(cardEl);
            }

            slotEl.appendChild(pileEl);
        } else {
            slotEl.classList.add('empty');
        }
    }
}

// Hämta översta kortet på en plats
function getTopCard(slotIndex) {
    const pile = slots[slotIndex];
    return pile.length > 0 ? pile[pile.length - 1] : null;
}

// Hitta alla synliga kort med samma färg
function findMatchingSuits() {
    const suitGroups = {};

    for (let i = 0; i < 4; i++) {
        const card = getTopCard(i);
        if (card) {
            if (!suitGroups[card.suit]) {
                suitGroups[card.suit] = [];
            }
            suitGroups[card.suit].push({ slotIndex: i, card });
        }
    }

    return suitGroups;
}

// Kolla om ett kort kan tas bort (finns annat kort med samma färg som är högre)
function canBeRemoved(slotIndex) {
    const card = getTopCard(slotIndex);
    if (!card) return false;

    const suitGroups = findMatchingSuits();
    const sameSuit = suitGroups[card.suit];

    if (sameSuit && sameSuit.length > 1) {
        // Hitta högsta värdet
        const maxValue = Math.max(...sameSuit.map(c => c.card.value));
        // Kan tas bort om det inte är det högsta kortet
        return card.value < maxValue;
    }

    return false;
}

// Ta bort ett kort
function removeCard(slotIndex) {
    if (canBeRemoved(slotIndex)) {
        slots[slotIndex].pop();
        renderSlots();
        updateStatus();
        checkGameOver();
    }
}

// Hitta tomma platser
function findEmptySlots() {
    const empty = [];
    for (let i = 0; i < 4; i++) {
        if (slots[i].length === 0) {
            empty.push(i);
        }
    }
    return empty;
}

// Flytta kort till tom plats
function moveCard(fromSlot, toSlot) {
    if (slots[fromSlot].length > 0 && slots[toSlot].length === 0) {
        const card = slots[fromSlot].pop();
        slots[toSlot].push(card);
        selectedSlot = null;
        renderSlots();
        updateStatus();
    }
}

// Dela ut kort
function dealCards() {
    if (deck.length === 0 || gameOver) return;

    // Rensa val
    selectedSlot = null;

    // Lägg ett kort på varje plats
    for (let i = 0; i < 4; i++) {
        if (deck.length > 0) {
            const card = deck.pop();
            slots[i].push(card);
        }
    }

    renderDeck();
    renderSlots();
    updateStatus();
    checkGameOver();
}

// Räkna poäng (antal kort kvar)
function countScore() {
    let total = 0;
    for (let pile of slots) {
        total += pile.length;
    }
    return total;
}

// Uppdatera status
function updateStatus() {
    const emptySlots = findEmptySlots();
    const statusEl = document.getElementById('status');

    if (gameOver) {
        return;
    }

    // Kolla om det finns kort att ta bort
    let removableCards = [];
    for (let i = 0; i < 4; i++) {
        if (canBeRemoved(i)) {
            removableCards.push(i);
        }
    }

    if (removableCards.length > 0) {
        statusEl.textContent = 'Klicka på kort med samma färg för att ta bort de lägre';
    } else if (selectedSlot !== null && emptySlots.length > 0) {
        statusEl.textContent = 'Klicka på en tom plats för att flytta kortet';
    } else if (emptySlots.length > 0) {
        statusEl.textContent = 'Klicka på ett kort för att flytta det till en tom plats';
    } else if (deck.length > 0) {
        statusEl.textContent = 'Klicka på kortleken för att dela ut nya kort';
    }
}

// Kontrollera om spelet är slut
function checkGameOver() {
    if (deck.length === 0) {
        // Kolla om det finns fler drag att göra
        let canRemove = false;
        for (let i = 0; i < 4; i++) {
            if (canBeRemoved(i)) {
                canRemove = true;
                break;
            }
        }

        if (!canRemove) {
            endGame();
        }
    }
}

// Avsluta spelet
function endGame() {
    gameOver = true;
    const score = countScore();
    const statusEl = document.getElementById('status');
    statusEl.innerHTML = `<strong>Spelet är slut! Poäng: ${score}</strong> (lägre är bättre)`;
    statusEl.classList.add('game-over');
}

// Hantera klick på kortplats
function handleSlotClick(slotIndex) {
    if (gameOver) return;

    const emptySlots = findEmptySlots();

    // Om platsen är tom och vi har ett valt kort, flytta dit
    if (slots[slotIndex].length === 0 && selectedSlot !== null) {
        moveCard(selectedSlot, slotIndex);
        return;
    }

    // Om kortet kan tas bort, ta bort det
    if (canBeRemoved(slotIndex)) {
        removeCard(slotIndex);
        return;
    }

    // Om det finns tomma platser, välj/avvälj kort för flytt
    if (emptySlots.length > 0 && slots[slotIndex].length > 0) {
        if (selectedSlot === slotIndex) {
            selectedSlot = null;
        } else {
            selectedSlot = slotIndex;
        }
        renderSlots();
        updateStatus();
    }
}

// Starta om spelet
function restartGame() {
    if (!hasQuotaLeft()) {
        showQuotaExceeded();
        return;
    }

    gameOver = false;
    selectedSlot = null;
    slots = [[], [], [], []];
    document.getElementById('status').classList.remove('game-over');
    document.getElementById('restart-btn').disabled = false;
    incrementGamesPlayed();
    createDeck();
    renderDeck();
    renderSlots();
    updateStatus();
}

// Event listeners
document.getElementById('deck').addEventListener('click', dealCards);

for (let i = 0; i < 4; i++) {
    document.getElementById(`slot-${i}`).addEventListener('click', () => handleSlotClick(i));
}

document.getElementById('restart-btn').addEventListener('click', restartGame);

document.getElementById('hints-toggle').addEventListener('change', (e) => {
    hintsEnabled = e.target.checked;
    renderSlots();
});

// Initiera spelet
function initGame() {
    updateQuotaDisplay();

    if (!hasQuotaLeft()) {
        showQuotaExceeded();
        return;
    }

    incrementGamesPlayed();
    createDeck();
    renderDeck();
    renderSlots();
    updateStatus();
}

initGame();
