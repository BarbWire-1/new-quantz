/*
 *   Copyright (c) 2026
 *   All rights reserved.
 */
// In /Users/barbara/new-quantz/index.js (Einstiegsdatei deiner Engine)

import { QElement } from "../src/QuantzCore/element.js"
import { html, createComponent } from "../src/QuantzCore/factory.js"


import { autoScrollToBottom, autoScroll } from "../src/plugins/scroll.js";

// import {
// 	printTimeSummary,
// 	timeStart,
// 	trace,
// 	RENDER_STATS,
// } from 'quantz';


// DER ENTSCHEIDENDE PRODUKTIONS-EXPORT:
//import { printTimeSummary, RENDER_STATS } from 'quantz/plugins/metrics'; // Pfad zu deiner Metrics.js anpassen!



export const UserCard = createComponent(
	'user-card',
	class UserCard extends QElement {

		count = 0;
			// users = [
			// 	{
			// 		id: 0,
			// 		name: 'John Doe',
			// 		avatar: '',
			// 		age: 42,
			// 	},
			// ];
			users = []

			totalInteractions = 0;



		updateData(n) {
			this.count = n;
			this.fetchUserData();
		}

		async fetchUserData() {
			try {
				const response = await fetch(
					`https://randomuser.me/api/?results=${this.count}`
				);
				if (!response.ok) throw new Error('API Network Crash');
				const data = await response.json();

				// format data
				const freshUsers = data.results.map(rawUser => {
					const userObj = {
						id: rawUser.login.uuid,
						name: `${rawUser.name.first} ${rawUser.name.last}`,
						avatar: rawUser.picture.thumbnail,
						age: rawUser.dob.age,
					};

					return userObj;
				});

				// Zuweisung überschreibt das "Loading..."-Array komplett
				this.users = freshUsers;
				this.loadingText = '';
			} catch (error) {
				this.loadingText = 'Fetch failed!';
				console.error('Fetch failed', error);
			}
		}

		template() {
			this.loadingText = `Fetching ${this.count} profiles from randomuser.me...`;
			// here create structure per card
			return html`
				<div style="font-family: system-ui, sans-serif; padding: 20px;">
					<header
						style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px;"
					>
						<h2>Quantz Performance Directory (${this.users.length} Profiles)</h2>

						<!-- 🎯 CONDITIONAL RENDERING TEST AUẞERHALB DER SCHLEIFE -->
						<!-- Wechselt das komplette Markup im Header basierend auf der Interaktions-Anzahl -->
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

						<h4>FUCKING STATIC PRIMITIVE TEXT</h4>
					</header>
					<!-- TODO NOT handling false for non text??? -->
					<h3
						style="color: #666; text-align: center; display: ${this.loadingText === '' ? 'inline' : 'none'}"
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
									<p style="font-size: 11px; color: crimson;">Loop Verification ID: ${u.id}</p>

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

// ============================================================================
// 3. INITIALISIERUNG
// ============================================================================
