# Working out how much more I can schedule

## Start with the easy calculation

“If I can work 28 hours in seven days, and I've already worked 18 hours, how many hours do I have left?”

$$
28 - 18 = 10\text{ hours}.
$$

For one seven-day period, subtraction is enough. But I want to plan several dates, not just one. I also have hours from different jobs to include. The difficult part is making sure the whole schedule fits, rather than finding a number that looks safe for each day separately.

I use 28 hours in these examples because it is one of Jikanri's presets. The limits are configurable; this is not a complete interpretation of working-hour law.

## The seven-day period keeps moving

A calendar week has a fixed start. A rolling seven-day period can start on any day. Here is a small fictional example, with all jobs added together:

| Day | Mon 1 | Tue 2 | Wed 3 | Thu 4 | Fri 5 | Sat 6 | Sun 7 | Mon 8 | Tue 9 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Recorded hours | 4 | 4 | 4 | 2 | 2 | 2 | 0 | 0 | 0 |

Monday–Sunday contains 18 hours. Move forward one day, and Tuesday–Monday contains 14: the first Monday's four hours have dropped out. Wednesday–Tuesday contains 10.

Now suppose I add eight hours on Sunday and eight on the second Monday. Sunday alone would bring the first window to 26 hours. Monday alone would bring the second window to 22. Both also fit an eight-hour daily cap.

Together, though, they bring Tuesday–Monday to **30 hours**: 14 recorded plus 16 added. The two dates look fine separately, but do not work together.

That overlap is the main problem I need to solve. An hour added on one date can affect seven different window totals. I cannot just calculate each day's spare hours and use all of them.

## Use variables for the hours I haven't decided yet

Recorded hours are already known. The extra hours are what I am trying to choose. I write $x_d$ for the hours added on date $d$.

Jikanri schedules **one selected job at a time**, so I do not need a separate unknown for every job. Other jobs' recorded hours stay fixed. I use $h_d$ for the hours already recorded across all jobs, and $b_d$ for the selected job's recorded hours.

Archived jobs still belong in $h_d$. If I leave a job, the hours I worked there last week have not disappeared.

## Write down the rules

A constraint is just a rule the schedule has to follow. The first one is simple: I cannot add a negative number of hours.

$$
x_d \geq 0.
$$

Next is the combined daily cap. If the cap is eight hours and I already have five recorded, I can add at most three. Calling the daily cap $T_d$, I write:

$$
x_d \leq \max(0, T_d - h_d).
$$

The zero is there for an awkward but important case: recorded work might already exceed the cap. I do not want to change those records to make the calculation look better. Instead, I leave them alone and stop additions from making that particular violation worse. It does not make the original hours compliant.

The selected job has its own daily cap, $P_d$, too:

$$
x_d \leq \max(0, P_d - b_d).
$$

For example, four recorded Research hours under a six-hour Research cap leave two hours. It does not matter if there is more room under the combined cap. Jikanri's job cap means **recorded plus added hours**, not a fresh allowance for each proposal.

Having spare hours is also different from being available. Research might be unavailable even on a nearly empty date. The usual weekdays apply unless an exception overrides them. Specific dates come first, then the last matching date range. Without either, the recurring weekday/weekend and configured holiday rules apply.

A specially available date can bypass those date blocks, but cannot bypass hour limits or an archived or scheduling-disabled job. A date-specific maximum is another cap on total selected-job hours. These rules only affect proposals: I can still record actual work on an unavailable day.

For the selected job's Sunday–Saturday weekly cap, I subtract the hours already recorded in that full week, including dates in neighboring months. If the week crosses monthly settings, Jikanri uses the **smallest weekly cap among its seven dates**. With a 12-hour weekly cap and nine recorded hours, only three more hours fit in the whole week.

The month works the same way. If $B$ is the selected job's monthly cap and $D$ is the set of dates in the selected month:

$$
\sum_{d\in D} x_d \leq \max\left(0, B - \sum_{d\in D} b_d\right).
$$

All the additions must share what is left. A monthly warning threshold is only a warning, not another cap. For each limit, a saved monthly override replaces the default value; other fields keep their defaults.

Then I repeat the subtraction for every rolling window. Let $W_t$ contain the seven dates ending on $t$, and let $R_t$ be its limit:

$$
\sum_{d\in D\cap W_t} x_d \leq \max\left(0, R_t - \sum_{d\in W_t} h_d\right).
$$

The right side is the remaining capacity. The left side adds up the proposed hours inside that window. Unlike the job-specific rules, the recorded part includes **every job**.

The window uses the cap for its **ending date's month**. When planning January, the code checks window ends from January 1 through February 6. It includes recorded December and February hours, but only chooses new hours inside January. Those are all the windows that a January addition can affect.

## Decide which schedule I want

I need a schedule that does not break the rules. That is called a *feasible* schedule. But several schedules might fit, so I also need a way to choose between them. An *optimal* schedule is one that gets the best score under the rules.

I want the most additional hours first. If two schedules add the same hours, I prefer the one that uses fewer dates.

The code counts half-hour units. I call that count $u_d$, so $u_d=2x_d$ and $u_d$ is a nonnegative integer. Another variable, $z_d$, is either zero or one and marks whether a new block is active on that date.

The score to maximize is:

$$
\max\left(1000\sum_{d\in D}u_d - \sum_{d\in D}z_d\right).
$$

Eight additional hours give 16,000 points for their 16 units. Using two dates gives a final score of 15,998; using four gives 15,996. The first is slightly better.

One extra half-hour earns 1,000 points. A month has at most 31 dates, so the date penalty can never outweigh that extra unit. This keeps the priorities in the right order. It counts dates receiving new hours, not all dates with existing work. It does not try to maximize pay or balance the workload.

## Let the solver try the combinations

Once I have variables, rules, and a score, I can give them to a solver. This is a mixed-integer linear program. Jikanri uses the bundled **javascript-lp-solver 1.0.3**, not an AI model.

Using integer half-hour units keeps suggestions on a useful grid. A capacity of 2.3 hours rounds down to two schedulable hours. A minimum block of 1.2 hours rounds up to 1.5. This step does not round recorded work.

If $m_d$ is the minimum unit count and $M_d$ is the maximum, the code links the unit count and active-day flag like this:

$$
m_d z_d \leq u_d \leq M_d z_d.
$$

With $z_d=0$, the date gets no units. An active date has to fit its minimum and maximum. A zero configured minimum still permits half-hour additions. Hours already recorded on that date do not count toward the minimum for a new addition.

The solver has an eight-second timeout and zero configured tolerance. Its compact result does not reliably tell the application whether the best possible answer has been proved. That is why the UI says **feasible, optimality unproven**. A valid-looking answer alone is not enough to claim optimality.

## Have another way to get a proposal

If the solver is missing, throws an error, or returns unusable output, the fallback tries adding hours a little at a time. It starts with a minimum-sized block, then adds half-hour steps. Each step has to pass the verifier.

It tries dates in four orders: first to last, last to first, largest capacity first, and smallest capacity first. It keeps the result with the most hours, breaking ties by fewer dates. This gives it more than one chance, but an early choice can still block a better later combination. It does not guarantee the best answer.

## Check the answer rather than just trusting it

Both solver and fallback proposals are checked before display and again before application. The verifier recalculates daily capacity, minimum blocks, half-hour increments, weekly/monthly totals, and every affected rolling window.

Some of these checks share helpers with the model, so passing them is not an independent proof. In my local development checks, small examples also enumerate possible schedules independently and compare their best scores with the solver's answer. Other cases cover month/year boundaries, multiple jobs, archived hours, overrides, blocked dates, zero capacity, existing violations, and solver failure. Invalid and incomplete solver responses are simulated; an actual timeout has not been reproduced. These development checks are kept locally rather than included in the public application files.

## A complete small example

Take two fictional jobs in January 2030: Tour guiding and Research. Guiding has six recorded hours on each of January 1, 2, and 3, making 18 hours. For this example, I can add Research on January 4 and 6. January 5 is unavailable, other January dates are blocked, and January 6 has a special available exception.

Set the combined daily cap to eight and the rolling cap to 28. Research has a six-hour daily cap, an eight-hour weekly cap, an eight-hour monthly cap, and a two-hour minimum block.

There is room for ten hours in the shared rolling windows, but the Research monthly cap leaves only eight. I cannot put all eight on one date because of its six-hour daily cap.

One **illustrative feasible schedule** is four hours on January 4 and four on January 6. Both blocks meet the minimum. The affected combined totals reach at most 26 hours, and each Research week stays within eight. Nothing is added on January 5.

A local check against the implementation confirms that eight hours on two dates is achievable, with score 15,998. It does not require this exact split: six plus two ties with four plus four.

## What this model leaves out

I am planning daily totals for one job and one month, not clock times, overnight shifts, or several jobs at once. Adjacent-month records constrain the plan, but unknown future work in those months is not invented. Existing violations stay visible as separate warnings. The fallback can miss better answers, and solver feasibility is not an optimality certificate. This is a personal planning tool, not a guarantee of compliance with immigration or employment law.
