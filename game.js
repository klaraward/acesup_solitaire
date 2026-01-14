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
let hintMode = localStorage.getItem('hintMode') || 'show'; // 'off', 'exists', 'show'
let colorfulSuits = localStorage.getItem('colorfulSuits') === 'true';

// Kvot-hantering
const DAILY_QUOTA = 10;
const UNLIMITED_PARAM = 'unlimited';

// Räknare för unika spelare idag
function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

function getVisitKey() {
    return 'visitedToday_' + getTodayDateString();
}

function hasVisitedToday() {
    return localStorage.getItem(getVisitKey()) === 'true';
}

function markVisitedToday() {
    localStorage.setItem(getVisitKey(), 'true');
}

// UUID-hantering
function getOrCreatePlayerId() {
    let playerId = localStorage.getItem('playerId');
    if (!playerId) {
        playerId = crypto.randomUUID();
        localStorage.setItem('playerId', playerId);
    }
    return playerId;
}

function updatePlayerCountDisplay(count) {
    const el = document.getElementById('player-count');
    if (!el) return;

    if (count === null || count === undefined) {
        el.textContent = '';
    } else if (count === 1) {
        el.textContent = 'Du är första spelaren idag!';
    } else {
        el.textContent = `${count} spelare idag`;
    }
}

async function registerPlayerWithFirebase() {
    if (!window.firebaseDb) {
        // Firebase inte laddat än, vänta
        setTimeout(registerPlayerWithFirebase, 100);
        return;
    }

    const today = getTodayDateString();
    const countRef = window.firebaseRef(window.firebaseDb, `dailyPlayers/${today}`);
    const playerId = getOrCreatePlayerId();

    try {
        if (!hasVisitedToday()) {
            // Ny spelare - öka räknaren med transaktion
            await window.firebaseRunTransaction(countRef, (currentCount) => {
                return (currentCount || 0) + 1;
            });
            markVisitedToday();

            // Spara spelarens UUID i Firebase
            const playerRef = window.firebaseRef(window.firebaseDb, `players/${playerId}`);
            const timestamp = new Date().toISOString();
            await window.firebaseRunTransaction(playerRef, (playerData) => {
                if (!playerData) {
                    return { firstVisit: timestamp, lastVisit: timestamp, visitCount: 1 };
                }
                return {
                    ...playerData,
                    lastVisit: timestamp,
                    visitCount: (playerData.visitCount || 0) + 1
                };
            });
        }

        // Hämta aktuellt antal
        const snapshot = await window.firebaseGet(countRef);
        const count = snapshot.val() || 0;
        updatePlayerCountDisplay(count);
    } catch (error) {
        console.error('Firebase-fel:', error);
        updatePlayerCountDisplay(null);
    }
}

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

// Hämta CSS-klass för svit
function getSuitColorClass(suit) {
    if (colorfulSuits) {
        switch (suit) {
            case '♥': return 'suit-hearts';
            case '♦': return 'suit-diamonds';
            case '♠': return 'suit-spades';
            case '♣': return 'suit-clubs';
        }
    }
    return isRed(suit) ? 'red' : 'black';
}

// Skapa HTML för ett kort
function createCardElement(card, slotIndex) {
    const div = document.createElement('div');
    div.className = `card front ${getSuitColorClass(card.suit)}`;
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

                    // Markera kort som kan tas bort (endast översta, om hints är på 'show')
                    if (hintMode === 'show' && canBeRemoved(i)) {
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
        updateHintIndicator();
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
        updateHintIndicator();
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
    updateHintIndicator();
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
        // Kolla om det finns kort att ta bort
        let canRemove = false;
        for (let i = 0; i < 4; i++) {
            if (canBeRemoved(i)) {
                canRemove = true;
                break;
            }
        }

        // Kolla om man kan flytta kort (tom plats + hög med flera kort)
        const emptySlots = findEmptySlots();
        const canMove = emptySlots.length > 0 && slots.some(pile => pile.length > 1);

        if (!canRemove && !canMove) {
            endGame();
        }
    }
}

// Avsluta spelet
function endGame() {
    gameOver = true;
    const score = countScore();
    const statusEl = document.getElementById('status');

    if (score === 4) {
        statusEl.innerHTML = '<strong>Grattis, du vann!</strong>';
    } else {
        statusEl.innerHTML = `<strong>Spelet är slut! Poäng: ${score}</strong> (lägre är bättre)`;
    }
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

// Kolla om översta kortet kan tas bort efter att underkortet exponeras
function canRemoveAfterExposing(slotIndex) {
    const pile = slots[slotIndex];
    if (pile.length < 2) return false;

    const topCard = pile[pile.length - 1];
    const secondCard = pile[pile.length - 2];

    // Kolla om översta kortet är lägre än underkortet och samma svit
    if (topCard.suit === secondCard.suit && topCard.value < secondCard.value) {
        return true;
    }
    return false;
}

// Hantera dubbelklick - genväg för att flytta och ta bort
function handleSlotDoubleClick(slotIndex) {
    if (gameOver) return;

    // Enkelklicket har redan valt kortet, så avmarkera först
    selectedSlot = null;

    // Kolla om det finns tomma platser (exklusive om vi precis flyttade dit)
    const emptySlots = findEmptySlots();
    if (emptySlots.length === 0) return;

    const pile = slots[slotIndex];
    if (pile.length < 2) return;

    if (canRemoveAfterExposing(slotIndex)) {
        // Ta bort översta kortet direkt (det ligger på ett högre kort av samma svit)
        pile.pop();

        renderSlots();
        updateStatus();
        updateHintIndicator();
        checkGameOver();
    }
}

// Kolla om spelaren har perfekt ställning (4 ess i varsina högar)
function hasPerfectPosition() {
    let acesInSinglePiles = 0;
    for (let pile of slots) {
        if (pile.length === 1 && pile[0].rank === 'A') {
            acesInSinglePiles++;
        }
    }
    return acesInSinglePiles === 4;
}

// Starta om spelet
function restartGame() {
    if (!hasQuotaLeft()) {
        showQuotaExceeded();
        return;
    }

    // Varna om spelaren har perfekt ställning
    if (hasPerfectPosition()) {
        const message = deck.length > 0
            ? 'Du har fyra ess i varsin hög! Vill du verkligen starta om?'
            : 'Grattis, du vann! Vill du verkligen starta om innan du hunnit ta en screenshot som bevis?';
        if (!confirm(message)) {
            return;
        }
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

const DOUBLE_CLICK_THRESHOLD = 300; // ms
let lastClickTime = {};
let lastClickSlot = null;

for (let i = 0; i < 4; i++) {
    document.getElementById(`slot-${i}`).addEventListener('click', () => {
        const now = Date.now();
        const timeSinceLastClick = now - (lastClickTime[i] || 0);

        if (lastClickSlot === i && timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
            // Dubbelklick - försök ta bort kort via genvägen
            if (canRemoveAfterExposing(i) && findEmptySlots().length > 0) {
                selectedSlot = null;
                handleSlotDoubleClick(i);
                lastClickTime[i] = 0; // Återställ så nästa klick inte blir dubbelklick
                return;
            }
        }

        lastClickTime[i] = now;
        lastClickSlot = i;
        handleSlotClick(i);
    });
}

document.getElementById('restart-btn').addEventListener('click', restartGame);

document.querySelectorAll('input[name="hints-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        hintMode = e.target.value;
        localStorage.setItem('hintMode', hintMode);
        renderSlots();
        updateHintIndicator();
    });
});

document.getElementById('colorful-suits').addEventListener('change', (e) => {
    colorfulSuits = e.target.checked;
    localStorage.setItem('colorfulSuits', colorfulSuits);
    renderSlots();
});

// Återställ sparade inställningar i UI
function restoreSettings() {
    // Hints
    const hintRadio = document.querySelector(`input[name="hints-mode"][value="${hintMode}"]`);
    if (hintRadio) hintRadio.checked = true;

    // Färgglada sviter
    document.getElementById('colorful-suits').checked = colorfulSuits;
}

restoreSettings();

// Uppdatera hint-indikator för 'exists'-läge
function updateHintIndicator() {
    const deckEl = document.getElementById('deck');

    if (hintMode !== 'exists' || gameOver) {
        deckEl.classList.remove('has-moves');
        return;
    }

    let hasRemovableCard = false;
    for (let i = 0; i < 4; i++) {
        if (canBeRemoved(i)) {
            hasRemovableCard = true;
            break;
        }
    }

    if (hasRemovableCard) {
        deckEl.classList.add('has-moves');
    } else {
        deckEl.classList.remove('has-moves');
    }
}

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
    updateHintIndicator();
}

initGame();
