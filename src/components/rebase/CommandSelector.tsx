import {
	Listbox,
	ListboxButton,
	ListboxOption,
	ListboxOptions,
} from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/24/outline";
import type { SimpleCommand } from "../../types/git";
import {
	COMMAND_COLORS,
	COMMAND_LABELS,
	SIMPLE_COMMANDS,
} from "../../types/git";

interface CommandSelectorProps {
	value: SimpleCommand;
	onChange: (command: SimpleCommand) => void;
	disabled?: boolean;
	/** Commands that should be disabled (shown but not selectable) */
	disabledCommands?: SimpleCommand[];
}

export function CommandSelector({
	value,
	onChange,
	disabled = false,
	disabledCommands = [],
}: CommandSelectorProps) {
	return (
		<Listbox value={value} onChange={onChange} disabled={disabled}>
			<div className="relative">
				<ListboxButton
					className={`relative w-24 cursor-pointer rounded-md py-1.5 pr-8 pl-3 text-left text-sm font-medium text-white shadow-sm focus:ring-2 focus:ring-white/25 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${COMMAND_COLORS[value]}`}
				>
					<span className="block truncate">{COMMAND_LABELS[value]}</span>
					<span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
						<ChevronUpDownIcon
							className="h-4 w-4 text-white/70"
							aria-hidden="true"
						/>
					</span>
				</ListboxButton>

				<ListboxOptions
					anchor="bottom start"
					className="z-50 mt-1 max-h-60 w-32 overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black/5 transition duration-100 ease-in focus:outline-none data-[closed]:opacity-0 dark:bg-gray-800 dark:ring-white/10"
				>
					{SIMPLE_COMMANDS.map((command) => {
						const isCommandDisabled = disabledCommands.includes(command);
						const disabledReason =
							isCommandDisabled && (command === "squash" || command === "fixup")
								? "先頭コミット、または前のコミットがすべてdropの場合は選択できません"
								: undefined;
						return (
							<ListboxOption
								key={command}
								value={command}
								disabled={isCommandDisabled}
								className={({ active }) =>
									`relative py-2 pr-4 pl-10 select-none ${
										isCommandDisabled
											? "cursor-not-allowed text-gray-400 opacity-40 dark:text-gray-600"
											: active
												? "cursor-pointer bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white"
												: "cursor-pointer text-gray-700 dark:text-gray-300"
									}`
								}
							>
								{({ selected }) => (
									<div title={disabledReason}>
										<span className="flex items-center gap-2">
											<span
												className={`inline-block h-3 w-3 rounded-full ${COMMAND_COLORS[command]} ${isCommandDisabled ? "opacity-40" : ""}`}
											/>
											<span
												className={`block truncate ${
													selected ? "font-medium" : "font-normal"
												}`}
											>
												{COMMAND_LABELS[command]}
											</span>
										</span>
										{selected && (
											<span className="absolute inset-y-0 left-0 flex items-center pl-3 text-green-600 dark:text-green-400">
												<CheckIcon className="h-4 w-4" aria-hidden="true" />
											</span>
										)}
									</div>
								)}
							</ListboxOption>
						);
					})}
				</ListboxOptions>
			</div>
		</Listbox>
	);
}
