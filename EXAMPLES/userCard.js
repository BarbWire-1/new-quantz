/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
// In /Users/barbara/new-quantz/index.js (Einstiegsdatei deiner Engine)

import { QElement } from '../src/QuantzCore/element.js';
import { html, createComponent } from '../src/QuantzCore/factory.js';

import { autoScrollToBottom, autoScroll } from '../src/plugins/scroll.js';

// Konstante für die Cache-Dauer (24 Stunden in Millisekunden)
const CACHE_LIFESPAN = 24 * 60 * 60 * 1000;

// 🚀 GENERISCHE DISK-UTILITIES (VÖLLIG ENTKOPPELT)
export function loadPoolFromDisk(storageKey) {
	try {
		const stored = localStorage.getItem(storageKey);
		if (!stored) return [];

		const envelope = JSON.parse(stored);
		const now = Date.now();

		// Prüfung auf Ablaufzeit der gespeicherten Daten
		if (envelope.timestamp && now - envelope.timestamp > CACHE_LIFESPAN) {
			localStorage.removeItem(storageKey);
			return [];
		}

		return envelope.data || [];
	} catch (e) {
		console.error(`[QEngine: Storage] Read failed for key "${storageKey}":`, e);
		return [];
	}
}

export function savePoolToDisk(storageKey, pool) {
	try {
		const envelope = {
			timestamp: Date.now(),
			data: pool,
		};
		localStorage.setItem(storageKey, JSON.stringify(envelope));
	} catch (e) {
		if (e.name === 'QuotaExceededError') {
			console.warn(`[QEngine: Storage] 🚨 LocalStorage full for key "${storageKey}"! Clearing.`);
			localStorage.removeItem(storageKey);
		} else {
			console.error(`[QEngine: Storage] Write failed for key "${storageKey}":`, e);
		}
	}
}

export const UserCard = createComponent(
	'user-card',
	class UserCard extends QElement {
		// reactive props
		count = 0;
		users = [];
		totalInteractions = 0;

		// LocalStorage Key Constant
		STORAGE_KEY = 'quantz_user_pool';

		// LIFECYCLE HOOK: Stellt Daten beim normalen Reload sofort wieder her
		connectedCallback() {
			super.connectedCallback?.();
			const diskPool = loadPoolFromDisk(this.STORAGE_KEY);
			if (diskPool.length > 0 && this.count === 0) {
				this.count = diskPool.length;
				this.fetchUserData();
			}
		}

		updateData(n) {
			this.count = n;
			this.fetchUserData();
		}

		// HOT RELOAD: Leert den spezifischen Speicherrest und holt alles frisch
		hotReload() {
			localStorage.removeItem(this.STORAGE_KEY);
			this.users = [];
			this.fetchUserData();
		}

		async fetchUserData() {
			const diskPool = loadPoolFromDisk(this.STORAGE_KEY);

			// Wenn count 0 ist, leeren wir die Anzeige direkt
			if (this.count === 0) {
				this.users = [];
				this.loadingText = '';
				return;
			}

			// Fast Path: Wenn genug gültige Profile im Speicher liegen
			if (this.count <= diskPool.length) {
				this.users = diskPool.slice(0, this.count);
				this.loadingText = '';
				return;
			}

			// Slow Path: Delta-Abrufe gegen die API
			const deltaCount = this.count - diskPool.length;

			try {
				// 🎯 EXAKT DEINE ORIGINAL-URL
				const response = await fetch(`https://randomuser.me/api/?results=${deltaCount}`);
				if (!response.ok) throw new Error('API Network Crash');
				const data = await response.json();

				// format delta data
				const freshDeltaUsers = data.results.map(rawUser => {
					return {
						id: rawUser.login.uuid,
						name: `${rawUser.name.first} ${rawUser.name.last}`,
						avatar: rawUser.picture.thumbnail,
						age: rawUser.dob.age,
					};
				});

				// Zusammenführen und wegsichern über generische Funktion
				const updatedPool = [...diskPool, ...freshDeltaUsers];
				savePoolToDisk(this.STORAGE_KEY, updatedPool);

				this.users = updatedPool.slice(0, this.count);
				this.loadingText = '';
			} catch (error) {
				this.loadingText = 'Fetch failed!';
				console.error('Fetch failed', error);
			}
		}

		template() {
			const diskPool = loadPoolFromDisk(this.STORAGE_KEY);
			const deltaCount = this.count - diskPool.length;

			this.loadingText =
				deltaCount > 0 ? `Fetching delta of ${deltaCount} new profiles from randomuser.me...` : '';

			return html`
				<div style="font-family: system-ui, sans-serif; padding: 20px;">
					<header
						style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px;"
					>
						<h2>Quantz Performance Directory (${this.users.length} Profiles)</h2>

						<!-- 🎯 HOT RELOAD BUTTON IM HEADER -->
						<button
							style="background: #ff5722; color: white; border: none; padding: 8px 15px; border-radius: 4px; font-weight: bold; cursor: pointer;"
							@click="${() => this.hotReload()}"
						>
							🔥 Hot Reload
						</button>

						<!--  CONDITIONAL RENDERING TEST  -->
						<div
							if="${this.totalInteractions % 2 === 0
								? html`<div style="background: #e8f5e9; padding: 5px 10px; border-radius: 4px;">
										Mutations (Even):
										<strong style="color: green;">${this.totalInteractions} 🟢</strong>
									</div>`
								: html`<div style="background: #e3f2fd; padding: 5px 10px; border-radius: 4px;">
										Mutations (Odd):
										<strong style="color: blue;">${this.totalInteractions} 🔵</strong>
									</div>`}"
						></div>


					</header>

					<h3
						style="color: #666; text-align: center; display: ${this.loadingText === '' ? 'none' : 'inline'}"
					>
						${this.loadingText}
					</h3>

					<div
						style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px;"
					>
						${this.users.map(
							(u, i) => html`
								<div
									style="border: 1px solid #ccc; padding: 10px; border-radius: 6px; text-align: center; background: white;"
								>
									<image style="border-radius: 50%" src="${u.avatar}"></image>
									<p><strong>${u.name}</strong></p>
									<p><strong>${u.age}</strong></p>

									<button
										@click="${() => {
											u.age++;
											this.totalInteractions++;

										}}"
									>
										Age: ${u.age}
									</button>
								</div>
							`
						)}
					</div>
				</div>
			`;
		}
	}
);
